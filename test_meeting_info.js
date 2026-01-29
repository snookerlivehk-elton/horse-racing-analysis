
const query = `
query racing($date: String, $venueCode: String) {
  raceMeetings(date: $date, venueCode: $venueCode) {
    id
    venueCode
    meetingType
    meetingNumber
    races {
      raceIndex
      postTime
      status
    }
  }
}
`;

const variables = {
    date: "2026-02-01",
    venueCode: "ST"
};

async function fetchMeeting() {
    try {
        console.log(`Fetching meeting info for ${variables.date}...`);
        const response = await fetch('https://info.cld.hkjc.com/graphql/base/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0',
                'Origin': 'https://bet.hkjc.com'
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        });

        const text = await response.text();
        try {
            const json = JSON.parse(text);
            if (json.errors) {
                console.log('Errors:', JSON.stringify(json.errors, null, 2));
            } else {
                console.log('Data:', JSON.stringify(json.data, null, 2));
            }
        } catch (e) {
            console.log('Response:', text.substring(0, 500));
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

fetchMeeting();
