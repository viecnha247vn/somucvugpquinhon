// ============================================================
//  Hàm máy chủ (Vercel Serverless Function) — QUÉT AI (Google Gemini)
//  Nhận ảnh từ app, gọi Gemini API để đọc, trả JSON.
//  KHÓA API nằm ở biến môi trường trên Vercel, KHÔNG lộ ra client.
//
//  Cài đặt 1 lần:
//   1) Đặt file này tại  api/scan.js  ở gốc repo (cùng chỗ index.html).
//   2) Lấy khóa Gemini miễn phí tại  https://aistudio.google.com/apikey
//   3) Vercel → Project → Settings → Environment Variables:
//        GEMINI_API_KEY = <khóa vừa lấy>
//        (tùy chọn) GEMINI_MODEL = gemini-3.6-flash
//   4) Deploy lại.
//  Gemini có gói miễn phí (giới hạn tần suất); vượt hạn mới tính phí.
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
    const image = body && body.image;
    const media_type = (body && body.media_type) || 'image/webp';
    if (!image) return res.status(400).json({ error: 'Thiếu ảnh.' });

    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

    const prompt =
`Bạn đọc ảnh chụp một trang sổ bộ hoặc giấy chứng nhận của giáo xứ Công giáo Việt Nam (có thể viết tay hoặc đánh máy, có thể cũ hoặc mờ). Hãy trích xuất thông tin của MỘT giáo dân chính trong ảnh.

Trả về một đối tượng JSON theo mẫu:
{
  "saint_name": "tên thánh (vd Giuse, Maria) hoặc null",
  "full_name": "họ và tên đầy đủ hoặc null",
  "gender": "nam | nu | null",
  "birth_date": "YYYY-MM-DD; nếu chỉ có năm dùng YYYY-01-01; không rõ để null",
  "sacraments": [
    {
      "type": "rua_toi | them_suc | thanh_the | hon_phoi | truyen_chuc | xuc_dau",
      "sac_date": "YYYY-MM-DD hoặc null",
      "place": "nơi lãnh nhận hoặc null",
      "minister": "linh mục/thừa tác viên ban hoặc null",
      "book_no": "số sổ hoặc null",
      "entry_no": "số thứ tự hoặc null",
      "spouse_name": "chỉ cho hôn phối, hoặc null"
    }
  ],
  "note": "ghi chú ngắn về chỗ không chắc chắn, hoặc null"
}

Quy tắc bắt buộc:
- Ô nào không đọc được thì để null. TUYỆT ĐỐI KHÔNG bịa hay đoán.
- Nếu không thấy bí tích nào thì "sacraments": [].
- Ngày tháng đưa về dạng số.`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    // Cả khóa cũ (AIza...) lẫn khóa mới (AQ....) đều gửi qua header x-goog-api-key
    // trên endpoint gốc này. KHÔNG dùng Authorization: Bearer (sẽ bị hiểu là OAuth → 401).
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: media_type, data: image } },
            { text: prompt }
          ]
        }],
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
    catch (e) { return res.status(200).json({ note: 'AI không trả về JSON hợp lệ', raw: txt.slice(0, 500) }); }
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
