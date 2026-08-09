// ============================================================
//  Hàm máy chủ (Vercel Serverless Function) — QUÉT AI (Google Gemini)
//  Nhận ảnh từ app, gọi Gemini API để đọc, trả JSON.
//  KHÓA API nằm ở biến môi trường trên Vercel, KHÔNG lộ ra client.
//
//  Cài đặt 1 lần:
//   1) Đặt file này tại  api/scan.js  ở gốc repo (cùng chỗ index.html).
//   2) Lấy khóa Gemini tại  https://aistudio.google.com/apikey
//   3) Vercel → Project → Settings → Environment Variables:
//        GEMINI_API_KEY = <khóa vừa lấy>
//        (tùy chọn) GEMINI_MODEL = gemini-3.6-flash  (hoặc gemini-3.5-flash-lite nếu bị quá tải)
//   4) Deploy lại.
//  Khóa AIza (cũ) và AQ. (mới) đều gửi qua header x-goog-api-key (KHÔNG dùng Bearer).
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
`Bạn đọc ảnh chụp một trang SỔ RỬA TỘI (hoặc sổ bộ / giấy chứng nhận) của giáo xứ Công giáo Việt Nam, có thể viết tay, cũ hoặc mờ. Trích xuất thông tin của MỘT giáo dân chính trong ảnh, đúng theo các mục có trên sổ.

Trả về một đối tượng JSON theo mẫu (đúng các khóa này):
{
  "saint_name": "Tên thánh trong mục 'Tên' (vd Maria, Giuse) hoặc null",
  "full_name": "Họ và tên trong mục 'Tên' (không gồm tên thánh) hoặc null",
  "gender": "nam | nu | null",
  "birth_date": "mục 'Sinh': YYYY-MM-DD; chỉ có năm thì YYYY-01-01; không rõ null",
  "birth_lunar": "mục 'Âm lịch' (vd '29/07 Đinh Dậu') hoặc null",
  "birth_place": "mục 'Tại' (nơi sinh) hoặc null",
  "father_name": "mục 'Cha' (kèm tên thánh) hoặc null",
  "mother_name": "mục 'Mẹ' (kèm tên thánh) hoặc null",
  "feast_day": "mục 'Ngày lễ bổn mạng' (vd '15.08') hoặc null",
  "sacraments": [
    {
      "type": "rua_toi | them_suc | thanh_the | hon_phoi | truyen_chuc | xuc_dau",
      "sac_date": "ngày lãnh nhận (mục 'RỬA TỘI ngày'): YYYY-MM-DD hoặc null",
      "place": "mục 'Tại nhà thờ' hoặc null",
      "minister": "mục 'Do Linh mục' hoặc null",
      "godparent": "mục 'Người đỡ đầu' hoặc null",
      "book_no": "'Sổ Rửa tội số' (vd '93/2017') hoặc null",
      "entry_no": "'Con thứ' (vd '01') hoặc null",
      "spouse_name": "chỉ cho hôn phối, hoặc null"
    }
  ],
  "note": "ghi chú ngắn về chỗ không chắc chắn, hoặc null"
}

Quy tắc bắt buộc:
- Với Sổ Rửa tội: luôn đưa 1 phần tử type "rua_toi" vào "sacraments".
- Ô nào không đọc được thì để null. TUYỆT ĐỐI KHÔNG bịa hay đoán.
- Ngày tháng đưa về dạng số.`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    // Khóa AIza (cũ) và AQ. (mới) đều gửi qua x-goog-api-key. KHÔNG dùng Authorization: Bearer.
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
