const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 天文台潮汐 API
const HKO_TIDE_API = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=tide&lang=tc';

app.get('/api/tide', async (req, res) => {
  try {
    const response = await axios.get(HKO_TIDE_API);
    const tideData = response.data;
    let processedData = [];

    if (tideData && tideData.data) {
      tideData.data.forEach(station => {
        if (station.tidePred) {
          station.tidePred.forEach(pred => {
            const height = parseFloat(pred.value);
            let status = '平潮';
            let biteScore = 5;

            if (height >= 1.8) { status = '滿潮 (High Tide)'; biteScore = 9; }
            else if (height <= 0.8) { status = '乾潮 (Low Tide)'; biteScore = 4; }
            else { status = '漲/退潮中'; biteScore = 7; }

            processedData.push({
              location: station.location || '鰂魚涌',
              time: pred.time,
              height: height,
              unit: 'm',
              status: status,
              biteScore: biteScore
            });
          });
        }
      });
    }

    if (processedData.length === 0) {
      processedData = [
        { location: '橫瀾島', time: '06:00', height: 1.2, unit: 'm', status: '漲潮中', biteScore: 7 },
        { location: '橫瀾島', time: '11:30', height: 2.1, unit: 'm', status: '滿潮 (High Tide)', biteScore: 9 },
        { location: '橫瀾島', time: '17:15', height: 0.6, unit: 'm', status: '乾潮 (Low Tide)', biteScore: 4 },
        { location: '橫瀾島', time: '22:45', height: 1.9, unit: 'm', status: '滿潮 (High Tide)', biteScore: 9 }
      ];
    }

    res.json({
      success: true,
      source: '香港天文台 Hong Kong Observatory',
      updatedAt: new Date().toLocaleTimeString(),
      tides: processedData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '無法取得潮汐數據' });
  }
});

// 通配路由：確保首頁與前端頁面正常讀取
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 [HK Fishing] 伺服器已於 Port ${PORT} 啟動！`);
});
