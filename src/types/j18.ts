export interface J18TrendResponse {
    code: number;
    message: string;
    data: {
        id: number;
        data: Record<string, Record<string, string[]>>; // Key: Race Number -> Key: Time Point (e.g., "30") -> Value: Horse Numbers Ranking
    };
    count: number;
}

export interface J18LikeResponse {
    code: number;
    message: string;
    data: {
        id: number;
        data: Record<string, number[]>; // Key: Race Number -> Value: Horse Numbers Ranking
    };
    count: number;
}

export interface J18PayoutItem {
    name: string; // Bet type name, e.g., "\u7368\u8d0f" (Win)
    list: {
        shengchuzuhe: string; // Winning combination, e.g., "8" or "8,9"
        paicai: string;       // Dividend, e.g., "354.00"
    }[];
}

export interface J18PayoutData {
    scene_num: number; // Race Number
    payout: string;    // JSON stringified array of J18PayoutItem
}

export interface J18PayoutResponse {
    code: number;
    message: string;
    data: {
        id: number;
        data: J18PayoutData[];
    };
}

// Parsed Payout Structure for internal use
export interface ParsedPayout {
    raceNo: number;
    pools: J18PayoutItem[];
}
