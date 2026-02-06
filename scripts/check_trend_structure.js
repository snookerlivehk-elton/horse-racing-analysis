
const https = require('https');

const url = "https://api.j18.hk/calculate/v1/trend?date=2024-01-01";

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        // Log the structure of the first race's data
        if(json.data && json.data.data) {
            const race1 = Object.values(json.data.data)[0];
            console.log("Trend Data Keys (Time points):", Object.keys(race1));
            console.log("Sample Data for '30':", race1['30']);
            console.log("Sample Data for '5':", race1['5']);
        } else {
            console.log("No data found");
        }
    } catch (e) {
        console.error(e);
    }
  });
}).on('error', (e) => {
  console.error(e);
});
