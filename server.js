const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 設定 Multer 處理圖片暫存 (限制 10MB)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 天文台潮汐 API
app.get('/api/tide', (req, res) => {
  res.json({
    success: true,
    tides: [
      { time: '02:15', height: '1.8m', status: '漲潮末期', biteScore: 8 },
      { time: '08:40', height: '0.6m', status: '退潮乾潮', biteScore: 4 },
      { time: '15:20', height: '2.1m', status: '滿潮黃金期', biteScore: 9 },
      { time: '21:50', height: '1.1m', status: '小退潮', biteScore: 6 }
    ]
  });
});

// 使用 Hugging Face Qwen2-VL 模型 (香港地區順暢存取)
app.post('/api/identify-fish', upload.single('image'), async (req, res) => {
  try {
    const token = process.env.HF_TOKEN;
    if (!token) {
      return res.status(500).json({ success: false, message: '伺服器未設定 HF_TOKEN，請於 Render 設定環境變數。' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: '請上傳魚隻照片。' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;

    const prompt = `你是一位香港專業海洋生物學家及資深釣友。請詳細分析這張相片中的魚類或海洋生物。
請嚴格輸出純 JSON 格式（不要包含任何 markdown 標籤、\`\`\`json 或額外文字）：
{
  "name": "中文學名",
  "localName": "香港本土俗稱（例如：黑立、黃腳立、泥鯭、石九公、連尖、紅鮪）",
  "category": "科別（例如：鯛科、石斑科、毒魚類）",
  "toxic": true或false,
  "toxicWarning": "若鰭棘/器官有毒請詳細說明毒棘位置與處置；若無毒請填寫『無毒可安心處理』",
  "releaseSize": "香港釣友建議保育放生體長（例如：15 cm）",
  "description": "簡述該魚種在香港沿岸（如碼頭、磯場）的習性與推薦釣法"
}`;

    const response = await fetch("https://api-inference.huggingface.co/models/Qwen/Qwen2-VL-7B-Instruct/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2-VL-7B-Instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ],
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hugging Face API 錯誤回應:', errorText);
      return res.status(500).json({ success: false, message: 'AI 模型正在熱機中或連線忙碌，請於 10 秒後重試。' });
    }

    const result = await response.json();
    let content = result.choices[0].message.content.trim();

    // 清理 JSON 字串標籤
    content = content.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

    const fishData = JSON.parse(content);
    res.json({ success: true, data: fishData });

  } catch (error) {
    console.error('AI 辨識執行錯誤:', error);
    res.status(500).json({ success: false, message: '辨識失敗，請上傳清晰的魚隻照片。' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
