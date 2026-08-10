// ============================================================
//  Hàm máy chủ (Vercel Serverless Function) — ĐỌC DANH SÁCH GIÁO LÝ
//  Nhận nội dung chữ trích từ file Word, gọi Gemini xếp thành lớp + học sinh.
//  Dùng chung GEMINI_API_KEY như api/scan.js.
//  Đặt file này tại  api/parse-list.js  ở gốc repo.
// ============================================================

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel.' });

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    let text = (body && body.text) || '';
    if (!text.trim()) return res.status(400).json({ error: 'Không có nội dung.' });
    if (text.length > 24000) text = text.slice(0, 24000); // giới hạn để tiết kiệm

    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

    const prompt =
`Dưới đây là nội dung (trích từ file Word) chứa DANH SÁCH HỌC SINH GIÁO LÝ của một giáo xứ Công giáo Việt Nam, có thể gồm nhiều lớp, thường trình bày dạng bảng (STT, Tên thánh, Họ và tên, Ngày sinh, Lớp...). Hãy sắp xếp thành JSON.

Trả về JSON:
{
  "school_year": "niên khóa nếu thấy (vd '2025-2026') hoặc null",
  "classes": [
    {
      "class_name": "tên lớp (vd 'Khai Tâm 1', 'Rước Lễ A') hoặc null",
      "level_name": "cấp/khối nếu suy ra được: Khai Tâm | Rước Lễ | Thêm Sức | Bao Đồng | Vào Đời | null",
      "students": [
        {"saint_name":"tên thánh (vd Maria, Giuse) hoặc null","full_name":"họ và tên KHÔNG gồm tên thánh","gender":"nam|nu|null","birth_date":"YYYY-MM-DD hoặc null"}
      ]
    }
  ]
}

Quy tắc:
- Nếu là bảng, đọc theo cột; dòng tiêu đề (STT, Tên thánh...) KHÔNG phải học sinh.
- Tách tên thánh khỏi họ tên (tên thánh thường đứng đầu: Maria, Giuse, Phêrô, Anna...).
- Nếu chỉ có một lớp thì "classes" có 1 phần tử. Không rõ tên lớp/cấp thì để null.
- TUYỆT ĐỐI KHÔNG bịa học sinh. Ngày sinh đưa về YYYY-MM-DD (chỉ năm → YYYY-01-01).

NỘI DUNG:
${text}`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: (data.error && data.error.message) || 'Lỗi gọi Gemini API' });

    const cand = data.candidates && data.candidates[0];
    if (!cand) {
      const reason = data.promptFeedback && data.promptFeedback.blockReason;
      return res.status(200).json({ error: reason ? ('AI chặn nội dung: ' + reason) : 'AI không trả về kết quả' });
    }
    const txt = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('').trim();
    const clean = txt.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (e) { return res.status(200).json({ error: 'AI không trả về JSON hợp lệ' }); }
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
