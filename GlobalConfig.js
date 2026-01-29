// #region site, env and txn config
// DON'T CHANGE
const siteConfig = {
    mass: { IS_SPEEDBET: false, IS_EWIN2: false, IS_DEBUG: false, IS_PREVIEW: false, IS_IB: true, ENABLE_PE_NOTE: true },
    speed: { IS_SPEEDBET: true, IS_EWIN2: false, IS_DEBUG: false, IS_PREVIEW: false, IS_IB: true, ENABLE_PE_NOTE: true },
    ewin2: { IS_SPEEDBET: false, IS_EWIN2: true, IS_DEBUG: false, IS_PREVIEW: false, IS_IB: true, ENABLE_PE_NOTE: false }
};

// ENV CONFIG
const envConfig = {
    PROD: {
        GRAPHQL_URL: 'https://info.cld.hkjc.com/graphql/base/',
        STUB_GRAPHQL_URL: 'https://info.cld.hkjc.com/graphql/base/',
        PUSH_URL: 'wss://ueb.hkjc.com/',
        PUSH_URL_NOLOGIN: 'wss://ueb.hkjc.com:52443/',
        PENOTES_URL: 'https://notes.hkjc.com',
        SPECIAL_URL: 'https://special.hkjc.com/e-win',
        CIAM_URL: 'https://auth.cld.hkjc.com',
        CIAM_APP_TOKEN_URL: 'https://aptn.cld.hkjc.com',
        CIAM_CLIENT_SECRET: 'k32Z2sTf',
        CUSTOMER_SECRET: 'eBX9QU6Z',
        SOLACE_OAUTH_PROVIDER: 'OP_CIAM_HIGHPRIV',
        INFOAPI_URL: 'https://infoapi.hkjc.com',
        APPD_KEY: 'SI-AAB-DJK',
        APPD_BEACON_URL: 'https://sin-col.eum-appdynamics.com',
        WCIP_URL: 'https://wcip.hkjc.com',
        JCRW_URL: 'https://racing.hkjc.com',
        JCFW_URL: 'https://football.hkjc.com',
        JCBW_URL: 'https://bet.hkjc.com',
        JCEW_URL: 'https://www.hkjc.com',
        SP_URL: 'https://special.hkjc.com',
        IS_URL: 'https://is.hkjc.com',
        M_URL: 'https://m.hkjc.com',
        RC_URL: 'https://rc.hkjc.com',
        CC_URL: 'https://cc.hkjc.com',
        MEMBER_URL: 'https://member.hkjc.com',
        ELOGIN_URL: 'https://elogin.hkjc.com',
        STAT_CENTER_URL: 'https://footylogic.com',
        GLASSBOX_REPORTER_URL: 'https://report.hkjc.glassboxdigital.io/glassbox/reporting/e4c523a4-e3ea-b2d2-0d9f-97ca4e010114/cls_report',
        GLASSBOX_DETECTOR_URL: 'https://cdn.gbqofs.com/hkjc/sp4e/p/detector-dom.min.js',
        SPORTCALLER_URL: 'https://hkjchalftime-prod.sportcaller.com',
        BETSHARE_URL:"https://sh.hkjc.com/api/betshare/",
        SH_URL: 'https://sh.hkjc.com',
        LITE_GLASSBOX_REPORTER_URL: 'https://report.hkjc.glassboxdigital.io/glassbox/reporting/50b9299e-cbfd-8e14-9672-900ae77176b7/cls_report',
        LITE_GLASSBOX_DETECTOR_URL: 'https://cdn.gbqofs.com/hkjc/hl/p/detector-dom.min.js',
        LITE_TXN_URL: 'https://bclient.hkjc.com',
        ARKLE_URL:'https://auth.ark.hkjc.com/am',

        WP_URL_ch: '//worldpool.hkjc.com/zh-HK?b_cid=CSLDSPA_2122WPOOL_JCBW_entry_CH',
        WP_URL_en: '//worldpool.hkjc.com/en-US?b_cid=CSLDSPA_2122WPOOL_JCBW_entry_EN',
        WP_URL_GL_ch: '//worldpool.hkjc.com/zh-HK?b_cid=CSLDSPA_2122WPOOL_BWRH_CN',
        WP_URL_GL_en: '//worldpool.hkjc.com/en-US?b_cid=CSLDSPA_2122WPOOL_BWRH_EN',

        ENABLE_DATADOG: true,
        ENABLE_APPD: false,
        DATADOG_RUM_CONFIG: {
            applicationId: '0be09e32-26de-487e-9ed3-96b90f5cb61b',
            clientToken: 'pube51201bb074f2a18e1a8e507d407d818',
            service: 'web_jcbw2_prod',
            env: 'PROD',
            get allowedTracingUrls() {
                const txnMassSiteIds = ['01', '02'];
                const txnMassUrl = `https://${txnDomainConfig.PROD_MASS}`;

                return [
                    txnMassUrl,
                    ...txnMassSiteIds.map(siteId => txnMassUrl.replace("//txn.", `//txn${siteId}.`)),
                    `https://${txnDomainConfig.PROD_SPEED}`,
                    `https://${txnDomainConfig.PROD_EWIN2_1}`,
                    `https://${txnDomainConfig.PROD_EWIN2_2}`,
                    envConfig.PROD.LITE_TXN_URL,
                    envConfig.PROD.ARKLE_URL,
                    envConfig.PROD.PENOTES_URL,
                    // envConfig.PROD.BETSHARE_URL,
                    envConfig.PROD.GRAPHQL_URL
                ]
            },
            sessionSampleRate: 10,
            sessionReplaySampleRate: 100,
            traceSampleRate: 10,
        }
    }
}

// TXN DOMAIN
const txnDomainConfig = {
    PROD_MASS: "txn.hkjc.com",
    PROD_SPEED: "speedbettxn.hkjc.com",
    PROD_EWIN2_1: "txnc01.hkjcfootball.com",
    PROD_EWIN2_2: "txnc01.hkjcracing.com"
}

// CMS DOMAIN
const cmsConfig = {
    PUBLISH: {
        COMMON_URL: 'https://common.hkjc.com',
        SITECORE_GRAPHQL_URL: 'https://consvc.hkjc.com/JCBW/api/graph',
        SITECORE_IMAGE_URL: 'https://consvc.hkjc.com',
        SITECORE_APIKEY: '{FF2309B7-E8BB-49B2-82A7-36AE0B48F171}',
        get ADOBE_LAUNCH_SCRIPT_URL() {
            return `${this.COMMON_URL}/wa/wa_launch_global_prod.js`
        }
    }
}

// TXN ENDPOINT
const txnEndPoint = (siteKey) => {
    return {
        LOGIN_SERVICE_URL: `https://${txnDomainConfig[siteKey]}/BetslipIB`,
        LOGIN_SERVICE_SICA_URL: `https://${txnDomainConfig[siteKey]}/BetslipIB`,
        TRANSACTION_URL: `https://${txnDomainConfig[siteKey]}/BetslipIB`,
        STATEMENT_URL: `https://${txnDomainConfig[siteKey]}/BetslipIB`,
        EFT_URL: `https://${txnDomainConfig[siteKey]}/BetslipIB`,
        CHANNEL_PARA_URL: `https://${txnDomainConfig[siteKey]}/betslipIB/services/Para.svc/GetSP4EEwinPara`,
        LITE_CHANNEL_PARA_URL: `https://${txnDomainConfig[siteKey]}/betslipIB/services/Para.svc/GetLiteEwinPara`
    }
}

// #endregion

const hostConfig = {

    // #region PROD
    'bet.hkjc.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["mass"],
        ...txnEndPoint("PROD_MASS"),
        JCBW_URL: 'https://bet2.hkjc.com'
    },
    'speedbet.hkjc.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["speed"],
        ...txnEndPoint("PROD_SPEED"),
        JCBW_URL: 'https://speedbet2.hkjc.com'
    },
    'betslip.hkjcfootball.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["ewin2"],
        ...txnEndPoint("PROD_EWIN2_1"),
        JCBW_URL: 'https://betslip2.hkjcfootball.com'
    },
    'logon.hkjcracing.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["ewin2"],
        ...txnEndPoint("PROD_EWIN2_2"),
        JCBW_URL: 'https://logon2.hkjcracing.com'
    },

    'bet2.hkjc.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["mass"],
        ...txnEndPoint("PROD_MASS"),
        JCBW_URL: 'https://bet.hkjc.com'
    },
    'speedbet2.hkjc.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["speed"],
        ...txnEndPoint("PROD_SPEED"),
        JCBW_URL: 'https://speedbet.hkjc.com'
    },
    'betslip2.hkjcfootball.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["ewin2"],
        ...txnEndPoint("PROD_EWIN2_1"),
        JCBW_URL: 'https://betslip.hkjcfootball.com'
    },
    'logon2.hkjcracing.com': {
        ...envConfig["PROD"],
        ...cmsConfig["PUBLISH"],
        ...siteConfig["ewin2"],
        ...txnEndPoint("PROD_EWIN2_2"),
        JCBW_URL: 'https://logon.hkjcracing.com'
    }
    // #endregion PROD
};

window.CiamFlag = Object.freeze({
    UseCiam: 0, //and ignore whitelist
    UseWhitelist: 1,
    UseArkle: 2, //and ignore whitelist
});

const host = location.host;
window.globalConfig = {
    SITE_DOMAIN: `https://${window.location.hostname}`,
    ENABLE_OLD_SITE_LINK: false,
    RC_ODDS_PUSH: true,
    FB_ODDS_PUSH: true,
    BS_DATA_REFRESH: true,
    RC_ODDS_PUSH_NO_LOGIN: true,
    FB_ODDS_PUSH_NO_LOGIN: false,
    BS_PREVIEW_DATA_REFRESH: true,
    PUSH_NO_LOGIN_SECRET: '2Wt5tGOzRm]yp~N',
    EXPRESS_ODDS_PUSH: false,  // WIN PLA
    EXPRESS_ODDS_PUSH2: false, // QIN QPL DBL
    MQTT_INACTIVE_DISCONNECT_TIME :30000,
    API_REQUEST_TIMEOUT: 3000,
    API_REFETCH_TIME: 12000,
    SPEEDBET_BASKET: ['A', 'B', 'C', 'D'],
    FB_TOURN_RESULT_DAYS: 60,
    PENOTE_ENDPOINT: {
        dummy: false,
        dummyquery: '/dev/racing/racingNotes.json',
        query: '/personalnote/api/Note/IndexForChannelsWithHorseIdRegister',
        general: '/racing/{0}/?redirect=Page/GeneralNotes/{1}&channel_id=4&b_cid=SPLDSP{2}_BWRace_1920PERSN_Manual',
        create: '/racing/{0}/?redirect=/HorseNotes/{1}/new&channel_id=4&b_cid=SPLDSP{2}_BWRace_1920PERSN_Horse',
        view: '/racing/{0}/?redirect=/HorseNotes/{1}/all&channel_id=4&b_cid=SPLDSP{2}_BWRace_1920PERSN_Horse',
        menu: '/racing/{0}/?redirect=/HorseNote&channel_id=4&b_cid=SPLDSP{2}_BWRace_1920PERSN_UI'
    },
    OES_ENDPOINT: '/pmu/odps/racing/v1/opGetSingleQTTOdds/JCBW',
    SIS_SAMPLING_INTERVAL: 5,
	resendOtpInterval: 100,
    LOGIN_TIMEOUT_DURATION: 60000,
    Show_Moblie_Home_PageTooltips: false,
    show_WINS_Balance: true,

    // Sep 2025 release
    enableTTGExpand: false, // SBSCHA-1639
    enableSimRunnerLink: true, // SBSCHA-1638
    ENABLE_ADOBE_ANALYTICS_TR: true, // SBSCHA-1630

    // Oct 2025 release
    ENABLE_SITECORE_SILK_COLOR_MIGRATION: true, // DM-5438

    // Winter 2025 release
    useLiveCastStatshub: true, // DM4605-12061
    ENABLE_SITECORE_BANNER_AD_TR: true, // SBSCHA-1792
    SITECORE_BANNER_AD_CONFIG: {
        get getBannerListUrl() {
            const url = new URL(new URL(globalConfig.SITECORE_GRAPHQL_URL).origin);
            url.pathname = '/bannerad/api/getbannerlist';
            return url.href;
        },
        getBannerListApiKey: '{05AEECC4-CCED-4931-B91D-AF82FACE6EE0}',
        zoneCodes: {
            GL: "BWHOTB",
            HR: "BWRHTB",
            FB: "BWFHTB",
            LY: "BW6HTB"
        },
        trackingConfig: { // aka Sitecore Universial Tracker (UT)
            url: 'https://banneradut.hkjc.com/interaction',
            timeout: 60, // seconds for submit to ut
        },
    },

    // Arkle
    NEW_CIAM: CiamFlag.UseWhitelist,
    MISSING_MOBILE_QRCODE: "RAO", // RAO or 3in1
    useVoiceOTP: true,
    useOTPPrefix: false,
    arkleProfiles: false,
    arkleTokenScope: 'hs_txn_session',
    useArkleAccessTokenInSolace: false,

    VERSION: '0.1.0.2917-L5.14R2-202601160650',
    CONFIG_VERSION: 'release/JCBW_2025_Winter',

    //===================
    //For UCD replace
    //===================
    ...hostConfig[window.location.hostname]
};