
window.racingConfig = 
{
    "autoRefreshInterval": 30,
    "racingPools" : "ALUP;WIN;PLA;W-P;QIN;QPL;QQP;FCT;TRI;D-T;T-T;DBL;TBL;TCE;6UP;F-F;JKC;TNC;QTT;CWA;CWB;CWC;IWN",
    "singleRacePool" : "WIN;PLA;QIN;QPL;IWN;CWA;CWB;CWC;FCT;TCE;TRI;FF;QTT",
	"multiRacePool" : "DBL;TBL;DT;TT;SixUP",
    "fixedOddsPool": "JKC;TNC",
    "validVenue": ["HV", "ST", "CH", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"],
    "autoRefreshPages": ['WP', 'JTCOMBO', 'PWIN', 'WPQ', 'CWA','CWB','CWC','IWN','FCT','TCE','QTT','TRI','FF','DBL','TBL',"DT",'TT','6UP','CWAALUP','CWAALLALUP','CROSS_ALUP','WPALUP', 'WPQALUP','FCTALUP', 'TRIALUP','JKC', 'TNC','TURNOVER'],
    "racingUrl": {
        "raceCardPDFFile":"{DOMAIN}/racing/Content/PDF/RaceCard/{0}_starter_r{1}{2}.pdf",
        "raceCardAllPDFFile":"{DOMAIN}/racing/Content/PDF/RaceCard/{0}_starter_all{1}.pdf",
        "raceCardOverseaPDFFile": "{DOMAIN}/racing/Content/PDF/RaceCard/OS{0}{1}_starter_{2}_r{3}.pdf",
        "raceCardOverseaAllPDFFile": "{DOMAIN}/racing/Content/PDF/RaceCard/OS{0}{1}_starter_{2}_all.pdf"
    },
    "ALUP_FORMULA": [
        [],
        [],
        ["2x1", "2x3"],
        ["3x1", "3x3", "3x4", "3x6", "3x7"],
        ["4x1", "4x4", "4x5", "4x6", "4x10", "4x11", "4x14", "4x15"],
        ["5x1", "5x5", "5x6", "5x10", "5x15", "5x16", "5x20", "5x25", "5x26", "5x30", "5x31"],
        ["6x1", "6x6", "6x7", "6x15", "6x20", "6x21", "6x22", "6x35", "6x41", "6x42", "6x50", "6x56", "6x57", "6x62", "6x63"]
    ],
    "FO_PAGE": ['JKC', 'TNC'],
    "ALUP_PAGE": ["CROSS_ALUP", "CWAALUP", "WPALUP", "WPQALUP" , "FCTALUP", "TRIALUP"],
    "AllupPools": ["WIN", "PLA", "W-P", "QIN", "QPL", "QQP", "FCT", "TRI", "CWA"],
    "Allup3LegPools": ["FCT", "TRI"],
    "MultiRacePage": ["DBL", "TBL", "DT", "TT", "6UP"],
    "hasSubType":["FCT", "TCE", "QTT"],
    "posPoolSubType" : ["S", "M", "B", "BM", "MB"],
    "showNonWinCmbPool": ["WIN", "IWN", "CWA" , "CWB" , "CWC"],
    "rbcMaxBetCount" : 60000,
    "AllPoolsMinBet":{
        "ALUP": 1, "WIN": 10, "PLA": 10, "W-P": 10, "QIN": 10, "QPL": 10, 
        "QQP": 10, "CWA": 10, "CWB": 10, "CWC": 10, "IWN": 100, "FCT": 10,
        "TCE": 1, "TRI": 1, "FF": 1, "QTT": 1, "DBL": 1, "TBL": 1,
        "DT": 1, "TT": 1, "6UP": 1, "JKC": 10, "TNC": 10,
    },
    "rbcBetType": {
        "ALUP": {"alup": true, "maxAlupLeg": 6, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "WIN": {"alup": true, "maxAlupLeg": 6, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "PLA": {"alup": true, "maxAlupLeg": 6, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "W-P": {"alup": true, "maxAlupLeg": 6, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        
        "QIN": {"alup": true, "maxAlupLeg": 6, "showBanker": true, "maxBankerNo": 1, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "QPL": {"alup": true, "maxAlupLeg": 6, "showBanker": true, "maxBankerNo": 1, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "QQP": {"alup": true, "maxAlupLeg": 6, "showBanker": true, "maxBankerNo": 1, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        
        "IWN": {"alup": false, "maxAlupLeg": 1, "showBanker": true, "maxBankerNo": 1, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "CWA": {"alup": true, "maxAlupLeg": 6, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": true},
        "CWB": {"alup": false, "maxAlupLeg": 1, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": true},
        "CWC": {"alup": false, "maxAlupLeg": 1, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": true},
        
        "FCT": {"alup": true, "maxAlupLeg": 3, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 2, "hasSubType": true, "multiLeg": false, "isCW": false},
        "TCE": {"alup": false, "maxAlupLeg": 1, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 3, "hasSubType": true, "multiLeg": false, "isCW": false},
        "TRI": {"alup": true, "maxAlupLeg": 3, "showBanker": true, "maxBankerNo": 2, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "FF": {"alup": false, "maxAlupLeg": 1, "showBanker": true, "maxBankerNo": 3, "scrRefund": true, "posCnt": 1, "hasSubType": false, "multiLeg": false, "isCW": false},
        "QTT": {"alup": false, "maxAlupLeg": 1, "showBanker": false, "maxBankerNo": 0, "scrRefund": true, "posCnt": 4, "hasSubType": true, "multiLeg": false, "isCW": false},
        
        "DBL": {"alup": false, "maxAlupLeg": 1, "showBanker": false, "maxBankerNo": 0, "scrRefund": false, "posCnt": 1, "hasSubType": false, "multiLeg": true, "isCW": false},
        "TBL": {"alup": false, "maxAlupLeg": 1, "showBanker": false, "maxBankerNo": 0, "scrRefund": false, "posCnt": 1, "hasSubType": false, "multiLeg": true, "isCW": false},
        "DT": {"alup": false, "maxAlupLeg": 1, "showBanker": true, "maxBankerNo": 2, "scrRefund": false, "posCnt": 1, "hasSubType": false, "multiLeg": true, "isCW": false},
        "TT": {"alup": false, "maxAlupLeg": 1, "showBanker": true, "maxBankerNo": 2, "scrRefund": false, "posCnt": 1, "hasSubType": false, "multiLeg": true, "isCW": false},
        "SixUP": {"alup": false, "maxAlupLeg": 1, "showBanker": false, "maxBankerNo": 0, "scrRefund": false, "posCnt": 1, "hasSubType": false, "multiLeg": true, "isCW": false}
    },
    "cwaMenu" : {
        "en": "3 PICK 1 (Composite Win)",
        "ch": "3揀1 (組合獨贏)",
        "child": [
            {
                "en": "Single",
                "ch": "單場",
                "pg": "cwa",
                "type": "CWA.ASPX"
            },
            {
                "en": "All Up - Individual Race View",
                "ch": "過關 - 個別場次版",
                "pg": "cwaalup",
                "type": "cwaalup"
            },
            {
                "en": "All Up - All Races View",
                "ch": "過關 - 所有場次版",
                "pg": "cwaallalup",
                "type": "cwaallalup"
            }
        ]
    },
    "cwbcMenu" : {
        "en": "Special Composite Win:",
        "ch": "特別組合獨贏項目:",
        "child": {
            "CWB" : {
                "en": "Winning Trainer",
                "ch": "勝出練馬師",
                "pg": "cwb",
                "type": "CWB"
            },
            "CWC" : {
                "en": "Winning Region",
                "ch": "勝出地區",
                "pg": "cwc",
                "type": "CWC"
            }
        }
    },
    "pushTopics": {
        "WIN": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/win/odds/full",
        "PLA": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/pla/odds/full",
        "WIN_EXPRESS": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/win/+/expr/odds/full",
        "PLA_EXPRESS": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/pla/+/expr/odds/full",
        "QIN": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/qin/odds/full",
        "QIN_EXPRESS2": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/qin/+/expr/odds/full",
        // "PWIN0": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/pwin0/odds/full",
        // "PWIN1": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/pwin1/odds/full",
        "PWIN0": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/win/snap/1stboost/odds/full",
        "PWIN1": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/win/snap/slide2m/odds/full",
        "QPL": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/qpl/odds/full",
        "QPL_EXPRESS2": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/qpl/+/expr/odds/full",
        "FCT": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/fct/odds/full",
        "IWN": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/iwn/odds/full",
        "CWA": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/cwa/odds/full",
        "CWB": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/cwb/odds/full",
        "CWC": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/cwc/odds/full",
        "TCE_TOP": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tce/odds/top_n",
        "TCE_BANK": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tce/odds/banker",
        "TRI": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tri/odds/full",
        "TRI_TOP": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tri/odds/top_n",
        "TRI_BANK": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tri/odds/banker",
        "QTT_TOP": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/qtt/odds/top_n",
        "QTT_BANK": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/qtt/odds/banker",
        "FF": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/f_f/odds/full",
        "FF_TOP": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/f_f/odds/top_n",
        "FF_BANK": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/f_f/odds/banker",
        "DBL": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/dbl/odds/full",
        "DBL_EXPRESS2": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/dbl/+/expr/odds/full",
        "ALL_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/+/inv",
        "FCT_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/fct/inv",
        "IWN_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/iwn/inv",
        "TCE_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tce/inv",
        "TRI_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tri/inv",
        "FF_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/f_f/inv",
        "QTT_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/qtt/inv",
        "DBL_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/dbl/inv",
        "TBL_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/tbl/inv",
        "DT_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/d_t/inv",
        "TT_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/t_t/inv",
        "6UP_INV": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/{no}/6up/inv",
        //"JKC": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/00/jkc/#",
        "JKC_ODD": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/00/jkc/+/odds",
        "JKC_STA": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/00/jkc/+",
        "JKC_DET": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/00/jkc/+/detail",
        "JKC_SEL":  "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/00/jkc/+/sell",
        //"TNC": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/00/tnc/#",
        "TNC_ODD": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/00/tnc/+/odds",
        "TNC_STA": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/00/tnc/+",
        "TNC_DET": "hk/d/prdt/wager/evt/01/upd/racing/{dt}/{ve}/00/tnc/+/detail",
        "TNC_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/00/tnc/+/sell",
        "WIN_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/win",
        "PLA_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/pla",
        "QIN_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/qin",
        "QPL_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/qpl",
        "IWN_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/iwn", 
        "FCT_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/fct", 
        "CWA_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/cwa", 
        "CWB_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/cwb",
        "CWC_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/cwc",
        "TCE_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/tce",
        "TRI_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/tri",
        "QTT_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/qtt",
        "FF_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/f_f",
        "DBL_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/dbl",
        "TBL_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/tbl",
        "DT_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/dt",
        "TT_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/tt",
        "6UP_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/6up",
        "ALL_SEL": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}/+",
        "ALL_RAC": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}/{no}",
        "ALL_MEE": "hk/d/evnt/racing/evt/01/upd/racing/{dt}/{ve}"

    },
    redirectIsReplaceWindow : false,
    enableWPBanner: true
}   
;
