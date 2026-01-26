# Horse Racing Scoring System (賽馬評分系統)

## Project Overview
This project implements a weighted scoring system for horse racing analysis, based on historical performance data.

## Scoring Logic (Based on Requirements)

### 1. Rank Points (名次得分)
*   **1st Place**: 8 points
*   **2nd Place**: 6 points
*   **3rd - 4th Place**: 3 points
*   **5th - 8th Place**: 1 point
*   **9th or worse**: 0 points

### 2. Weighted Dimensions (評分權重)
The final system score is calculated using the following weights:

| Dimension | Description | Weight |
| :--- | :--- | :--- |
| **Career History** | 出道至今表現 | **15%** |
| **Season History** | 今季表現 (2025/2026) | **35%** |
| **Track/Distance** | 同場同程表現 | **20%** |
| **Jockey** | 騎師表現 | **30%** |

### 3. Calculation Formula
```
Final Score = (Career_Score * 0.15) + 
              (Season_Score * 0.35) + 
              (Track_Score * 0.20) + 
              (Jockey_Score * 0.30)
```

## Tech Stack
*   **Language**: TypeScript
*   **Frontend**: React (Planned)
*   **Backend**: Node.js (Optional for data persistence)
