const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 天文台 API 網址
const HKO_TIDE_API = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=tide&lang=tc';
const HKO_WEATHER_API = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc';

app.get('/api/tide', async (req, res) => {
  try {
    // 併發抓取潮汐與天氣數據
    const [tideRes, weatherRes] = await Promise.all([
      axios.get(HKO_TIDE_API).catch(() => ({ data: null })),
      axios.get(HKO_WEATHER_API).catch(() => ({ data: null }))
    ]);

    // 1. 解析天氣數據（氣壓、風速、降雨）
    let pressure = 1013; // 預設標準氣壓 (hPa)
    let weatherCondition = '良好';
    let weatherBonus = 0;

    if (weatherRes.data) {
      // 取得京士柏氣壓
      if (weatherRes.data.meanPressure && weatherRes.data.meanPressure.value) {
        pressure = parseFloat(weatherRes.data.meanPressure.value);
      }

      // 氣壓加減分演算法
      if (pressure >= 1012) {
        weatherBonus += 1.5; // 高氣壓，水中溶氧量高
      } else if (pressure < 1005) {
        weatherBonus -= 2.0; // 低氣壓/暴雨前夕，魚沉底不開口
      }

      // 降雨影響
      if (weatherRes.data.rainfall && weatherRes.data.rainfall.data) {
        const hasRain = weatherRes.data.rainfall.data.some(r => r.max > 0);
        if (hasRain) {
          weatherBonus -= 1.0;
          weatherCondition = '有雨 (水質微混濁)';
        }
      }
    }

    // 2. 解析潮汐數據並計算綜合咬口指數
    const tideData = tideRes.data;
    let processedData = [];

    if (tideData && tideData.data) {
      tideData.data.forEach(station => {
        if (station.tidePred) {
          station.tidePred.forEach(pred => {
            const height = parseFloat(pred.value);
            let status = '平潮';
            let baseScore = 5;

            // 潮汐基礎分數
            if (height >= 1.8) {
              status = '滿潮 (High Tide)';
              baseScore = 8;
            } else if (height <= 0.8) {
              status = '乾潮 (Low Tide)';
              baseScore = 4;
            } else {
              status = '漲/退潮中 (流水動)';
              baseScore = 7;
            }

            // 結合天氣權重，計算最終咬口指數 (限制在 1-10 分之間)
            let finalBiteScore = Math.min(10, Math.max(1, Math.round((baseScore + weatherBonus) * 10) / 10));

            processedData.push({
              location: station.location || '鰂魚涌',
              time: pred.time,
              height: height,
              unit: 'm',
              status: status,
              biteScore: finalBiteScore,
              pressure: pressure,
              weatherCondition: weatherCondition
            });
          });
        }
      });
    }

    // 保底數據（若天文台 API 暫時無回應時使用）
    if (processedData.length === 0) {
      processedData = [
        { location: '橫瀾島', time: '06:00', height: 1.2, unit: 'm', status: '漲潮中', biteScore: Math.min(10, Math.max(1, 7 + weatherBonus)), pressure: pressure, weatherCondition: weatherCondition },
        { location: '橫瀾島', time: '11:30', height: 2.1, unit: 'm', status: '滿潮 (High Tide)', biteScore: Math.min(10, Math.max(1, 9 + weatherBonus)), pressure: pressure, weatherCondition: weatherCondition },
        { location: '橫瀾島', time: '17:15', height: 0.6, unit: 'm', status: '乾潮 (Low Tide)', biteScore: Math.min(10, Math.max(1, 4 + weatherBonus)), pressure: pressure, weatherCondition: weatherCondition }
      ];
    }

    res.json({
      success: true,
      source: '香港天文台 (即時潮汐 + 氣壓天氣動態計算)',
      updatedAt: new Date().toLocaleTimeString(),
      currentPressure: pressure + ' hPa',
      tides: processedData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '無法取得潮汐與天氣數據' });
  }
});

// 首頁與靜態頁面路由
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 [HK Fishing] 伺服器已於 Port ${PORT} 啟動！`);
});
