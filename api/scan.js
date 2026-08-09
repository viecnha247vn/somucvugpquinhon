// ============================================================
//  Hàm máy chủ (Vercel Serverless Function) — QUÉT AI (Google Gemini)
//  Đọc ảnh Sổ Rửa tội / Chứng nhận Hôn phối, trả JSON.
//  KHÓA API nằm ở biến môi trường trên Vercel, KHÔNG lộ ra client.
//
//  Cài đặt 1 lần:
//   1) Đặt file này tại  api/scan.js  ở gốc repo (cùng chỗ index.html).
//   2) Lấy khóa Gemini tại  https://aistudio.google.com/apikey
//   3) Vercel → Settings → Environment Variables:
//        GEMINI_API_KEY = <khóa>
//        (tùy chọn) GEMINI_MODEL = gemini-3.6-flash  (hoặc gemini-3.5-flash-lite nếu quá tải)
//   4) Deploy lại.
//  Khóa AIza (cũ) và AQ. (mới) đều gửi qua x-goog-api-key (KHÔNG dùng Bearer).
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
`Bạn đọc ảnh một trang sổ / giấy tờ của giáo xứ Công giáo Việt Nam — có thể là SỔ RỬA TỘI (một người) hoặc CHỨNG NHẬN HÔN PHỐI (hai người: BÊN NAM và BÊN NỮ). Có thể viết tay, cũ, mờ. Xác định loại giấy rồi trích xuất.

Trả về JSON theo mẫu (đúng khóa):
{
  "doc_type": "rua_toi | hon_phoi | khac",

  // NẾU là giấy MỘT người (Sổ Rửa tội): điền các trường phẳng này, để "parties": []
  "saint_name": "Tên thánh (mục 'Tên') hoặc null",
  "full_name": "Họ và tên (không gồm tên thánh) hoặc null",
  "gender": "nam | nu | null",
  "birth_date": "mục 'Sinh' YYYY-MM-DD; chỉ năm → YYYY-01-01; null",
  "birth_lunar": "mục 'Âm lịch' hoặc null",
  "birth_place": "mục 'Tại' (nơi sinh) hoặc null",
  "father_name": "mục 'Cha' hoặc null",
  "mother_name": "mục 'Mẹ' hoặc null",
  "feast_day": "mục 'Ngày lễ bổn mạng' hoặc null",
  "origin_parish": "mục 'Giáo xứ' hoặc null",
  "sacraments": [
    {"type":"rua_toi|them_suc|thanh_the|hon_phoi|truyen_chuc|xuc_dau","sac_date":"YYYY-MM-DD|null","place":"nơi|null","minister":"Do Linh mục|null","godparent":"Người đỡ đầu|null","book_no":"Sổ số|null","entry_no":"Con thứ|null","spouse_name":"chỉ hôn phối|null"}
  ],

  // NẾU là CHỨNG NHẬN HÔN PHỐI: điền 2 phần dưới, để các trường phẳng trên = null
  "marriage_book_no": "Sổ Hôn phối số (vd '32/2015') hoặc null",
  "parties": [
    {
      "side": "nam | nu",
      "saint_name": "...", "full_name": "...", "gender": "nam|nu",
      "birth_date": "YYYY-MM-DD|null",
      "father_name": "mục 'Cha'|null", "mother_name": "mục 'Mẹ'|null",
      "origin_parish": "mục 'Giáo xứ'|null",
      "sacraments": [
        {"type":"rua_toi","sac_date":"YYYY-MM-DD|null","place":"mục 'Tại' ngay dưới 'Rửa tội'|null"},
        {"type":"them_suc","sac_date":"YYYY-MM-DD|null","place":"mục 'Tại' ngay dưới 'Thêm sức'|null"}
      ]
    }
  ]
}

Quy tắc bắt buộc:
- Sổ Rửa tội: doc_type "rua_toi", điền trường phẳng, luôn có 1 bí tích type "rua_toi", "parties": [].
- Chứng nhận Hôn phối: doc_type "hon_phoi", "parties" gồm CẢ bên nam và bên nữ; mỗi bên lấy rửa tội + thêm sức (ngày và nơi). "marriage_book_no" lấy từ 'Sổ Hôn phối số'. Với hôn phối, "Tại" ngay dưới "Rửa tội" là nơi rửa tội, "Tại" ngay dưới "Thêm sức" là nơi thêm sức.
- Ô không đọc được để null. TUYỆT ĐỐI KHÔNG bịa. Ngày dạng số.`;

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
