
const https = require('https');

const url = "https://api.j18.hk/calculate/v1/like?date=2024-01-01";

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        // Log the structure of the first race's data
        if(json.data && json.data.data) {
            console.log("Like Data Structure:", JSON.stringify(json.data.data, null, 2));
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
