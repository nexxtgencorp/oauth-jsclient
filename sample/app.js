'use strict';

require('dotenv').config();

const https = require('https');

/**
 * Require the dependencies
 * @type {*|createApplication}
 */
const express = require('express');
const app = express();
const path = require('path');
const OAuthClient = require('intuit-oauth');
const bodyParser = require('body-parser');
const ngrok =  (process.env.NGROK_ENABLED==="true") ? require('ngrok'):null;

var environment = "";


/**
 * Configure View and Handlebars
 */
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, '/public')));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(bodyParser.json())

const urlencodedParser = bodyParser.urlencoded({ extended: false });

/**
 * App Variables
 * @type {null}
 */
let oauth2_token_json = null,
    redirectUri = '';


/**
 * Instantiate new Client
 * @type {OAuthClient}
 */

let oauthClient = null;


/**
 * Home Route
 */
app.get('/', function(req, res) {

    res.render('index');
});

/**
 * Get the AuthorizeUri
 */
app.get('/authUri', urlencodedParser, function(req,res) {
    var clientId = {sandbox:'ABDUklMpgzbURSw7n7Hd3GlUGevFCrc2VW0CxUB0BRnWxOUnEn', production:'ABFuZdxwZv0m1d83LAQ0yLK4E8S9WOwj3Ehc4EbjWBduKwrBlh'};
    var clientSecret = {sandbox:'VOeHMTWqTqSPw6reKIrkd5t6M6RTBd0BiXBbjuWv', production:'3zkOGoSXMtRiHRbETSGvHfwUrawmFhKQku86FZe4'};

    environment = req.query.json.environment;

    oauthClient = new OAuthClient({
        clientId: clientId[req.query.json.environment],
        clientSecret: clientSecret[req.query.json.environment],
        environment: req.query.json.environment,
        redirectUri: req.query.json.redirectUri
    });

    const authUri = oauthClient.authorizeUri({scope:[OAuthClient.scopes.Accounting],state:'intuit-test'});
    res.send(authUri);
});


/**
 * Handle the callback to extract the `Auth Code` and exchange them for `Bearer-Tokens`
 */
app.get('/callback', function(req, res) {

    oauthClient.createToken(req.url)
       .then(function(authResponse) {
             oauth2_token_json = JSON.stringify(authResponse.getJson(), null,2);
         })
        .catch(function(e) {
             console.error(e);
         });

    res.send('');

});

/**
 * Display the token : CAUTION : JUST for sample purposes
 */
app.get('/retrieveToken', function(req, res) {
    res.send(oauth2_token_json);
});


/**
 * Refresh the access-token
 */
app.get('/refreshAccessToken', function(req,res){

    oauthClient.refresh()
        .then(function(authResponse){
            console.log('The Refresh Token is  '+ JSON.stringify(authResponse.getJson()));
            oauth2_token_json = JSON.stringify(authResponse.getJson(), null,2);
            res.send(oauth2_token_json);
        })
        .catch(function(e) {
            console.error(e);
        });


});

/**
 * getCompanyInfo ()
 */
app.get('/getCompanyInfo', function(req,res){


    const companyID = oauthClient.getToken().realmId;

    const url = oauthClient.environment == 'sandbox' ? OAuthClient.environment.sandbox : OAuthClient.environment.production ;

    oauthClient.makeApiCall({url: url + 'v3/company/' + companyID +'/companyinfo/' + companyID})
        .then(function(authResponse){
            console.log("The response for API call is :"+JSON.stringify(authResponse));
            res.send(JSON.parse(authResponse.text()));
        })
        .catch(function(e) {
            console.error(e);
        });
});

/**
 * loadClasses ()
 */
app.post('/loadClasses', function(req,res){

    const companyID = oauthClient.getToken().realmId;

    const url = oauthClient.environment == 'sandbox' ? OAuthClient.environment.sandbox : OAuthClient.environment.production ;

    // --
    // START LOADING CLASSES
    // --
    var log = [];

    locations.forEach(function(item, i){
        setTimeout(() => {
            // If class doesn't exist

            var wildcardItem = (item.replace("|", "%")).replace("+", "%");

            oauthClient.makeApiCall({url: url + 'v3/company/' + companyID +'/query?query=select * from Class where Name like \'' + encodeURI(wildcardItem) + '\'&minorversion=43'}).then(function(query) {
                // console.log(query);
                // console.log(query.json.QueryResponse);

                var classParentId = { sandbox: "5000000000000137916", production: "3800000000000943678" };

                if (Object.keys(query.json.QueryResponse).length === 0 && query.json.QueryResponse.constructor === Object) {
                    console.log("Loading class: " + item);
                    const data = JSON.stringify({
                        "Name": item,
                        "ParentRef": {
                            "value": classParentId[environment] //SANDBOX 5000000000000137916 //PRODUCTION 3800000000000943678
                        }
                    });
                
                    let authToken = oauthClient.token.getToken();
                
                    const options = {
                        hostname: url.slice(8, -1), //SANDBOX sandbox-quickbooks.api.intuit.com //PRODUCTION quickbooks.api.intuit.com
                        port: 443,
                        path: '/v3/company/' + companyID + '/class?minorversion=42', //SANDBOX 4620816365027422400 //PRODUCTION 414033351
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + authToken.access_token
                        }
                    }
                    
                    const createReq = https.request(options, createRes => {
                        console.log(`statusCode: ${createRes.statusCode}`)
                        
                        createRes.on('data', d => {
                            process.stdout.write(d)
                        })
                    });
                    
                    createReq.on('error', error => {
                        console.error(error);
                        log.push(item + " - HTTP error - " + error.toString());
                    });
                    
                    createReq.write(data);
                    createReq.end();
                    console.log(item + " loaded.");
                    log.push(item + " loaded.");
                } else {
                    console.log(item + " already exists.");
                    log.push(item + " already exists.");
                }
            })
            .catch(function(e) {
                console.error(e);
                log.push(item + " - HTTP error - " + e.toString());
            });
        }, i * 1000);
    });
    res.send("Series of class requests are being made. Check server logs for more information.");
    // --
    // END LOADING CLASSES
    // --
});

/**
 * disconnect ()
 */
app.get('/disconnect', function(req,res){

  console.log('The disconnect called ');
  const authUri = oauthClient.authorizeUri({scope:[OAuthClient.scopes.OpenId,OAuthClient.scopes.Email],state:'intuit-test'});
  res.redirect(authUri);

});



/**
 * Start server on HTTP (will use ngrok for HTTPS forwarding)
 */
const server = app.listen(process.env.PORT || 8000, () => {
    console.log(`💻 Server listening on port ${server.address().port}`);
if(!ngrok){
    redirectUri = `${server.address().port}` + '/callback';
    console.log(`💳  Step 1 : Paste this URL in your browser : ` + 'http://localhost:' + `${server.address().port}`);
    console.log('💳  Step 2 : Copy and Paste the clientId and clientSecret from : https://developer.intuit.com')
    console.log(`💳  Step 3 : Copy Paste this callback URL into redirectURI :` + 'http://localhost:' + `${server.address().port}` + '/callback');
    console.log(`💻  Step 4 : Make Sure this redirect URI is also listed under the Redirect URIs on your app in : https://developer.intuit.com`);
}

});

/**
 * Optional : If NGROK is enabled
 */
if (ngrok) {

    console.log("NGROK Enabled");
    ngrok.connect({addr: process.env.PORT || 8000})
        .then(url => {
            redirectUri = url + '/callback';
            console.log(`💳 Step 1 : Paste this URL in your browser :  ${url}  `);
            console.log('💳 Step 2 : Copy and Paste the clientId and clientSecret from : https://developer.intuit.com  ');
            console.log(`💳 Step 3 : Copy Paste this callback URL into redirectURI :  ${redirectUri}`);
            console.log(`💻 Step 4 : Make Sure this redirect URI is also listed under the Redirect URIs on your app in : https://developer.intuit.com`);

        })
        .catch(() => {
            process.exit(1);
        });
}

var locations = [
    "TCE | BELPL-06",
    "TCE | BELPL-33",
    "TCE | BINDLOSS-PS",
    "TCE | BNDLO-20",
    "TCE | BRSTL-31",
    "TCE | CABRP-25",
    "TCE | CALGARY-TEST-1",
    "TCE | CALGARY-TEST-2",
    "TCE | CARMA-36",
    "TCE | CARON-PS",
    "TCE | CAROP-23",
    "TCE | CAROP-39",
    "TCE | CARPENTER-PS",
    "TCE | CENTRALIA-PS",
    "TCE | CHPLN-05",
    "TCE | CHPLN-32",
    "TCE | CHPLN-51",
    "TCE | CNTRL-19",
    "TCE | CRNDL-26",
    "TCE | CRNDL-39",
    "TCE | CROMWELL-PS",
    "TCE | CRPTR-15",
    "TCE | CSHSP-01A",
    "TCE | DALLAS-TEST-1",
    "TCE | DALLAS-TEST-2",
    "TCE | DAVIDCITY-PS",
    "TCE | DVDCT-21",
    "TCE | DVDCT-36",
    "TCE | EDINBURG PS",
    "TCE | ELMCREEKTRANS",
    "TCE | FERNEY-PS",
    "TCE | FERNY-14",
    "TCE | FERNY-30",
    "TCE | FREEMAN-PS",
    "TCE | FREMA-12",
    "TCE | FREMA-25",
    "TCE | FTRSM-31",
    "TCE | GRNFL-26",
    "TCE | HARTINGTON-PS",
    "TCE | HRBRT-25",
    "TCE | HRDSY-32",
    "TCE | HRTFD-22",
    "TCE | HRTGT-48",
    "TCE | KENDAL-PS",
    "TCE | KENDL-08",
    "TCE | KENDL-32",
    "TCE | LAKESEND-PS",
    "TCE | LBNTL-05",
    "TCE | LBNTL-25",
    "TCE | LIEBENTHAL PS",
    "TCE | LKSND-29",
    "TCE | LKSND-51",
    "TCE | LUFKIN PS",
    "TCE | LUVER-44",
    "TCE | LUVERNE-PS",
    "TCE | MDLTOWN-PS",
    "TCE | MDLTP-23",
    "TCE | MNTOR-35",
    "TCE | MONITOR-PS",
    "TCE | OYENP-47",
    "TCE | OYENP-57",
    "TCE | OYEN-PS",
    "TCE | PEROP-15",
    "TCE | PIERRON-PS",
    "TCE | PONCA CITY-PS",
    "TCE | PORTAGE-PS",
    "TCE | PRTLP-08",
    "TCE | PRTLP-09",
    "TCE | PRTLP-25",
    "TCE | PRTLP-38",
    "TCE | RAPID CITY-PS",
    "TCE | REGINA-PS",
    "TCE | REGNA-26",
    "TCE | ROSWL-31",
    "TCE | RPDCT-11",
    "TCE | RPDCT-25",
    "TCE | SALISBRY-PS",
    "TCE | SENECA-PS",
    "TCE | SEVERANCE-PS",
    "TCE | SLBRY-19-1",
    "TCE | SNECA-09",
    "TCE | SNTPL-20_9",
    "TCE | SNTPL-36_1",
    "TCE | STANTON-PS",
    "TCE | STLCT-17",
    "TCE | STLCT-44_8",
    "TCE | STNTO-28",
    "TCE | ST-PAUL-PS",
    "TCE | STWTV-11",
    "TCE | STWTV-31",
    "TCE | SVRNC-02-1",
    "TCE | SVRNC-16",
    "TCE | TINAP-10",
    "TCE | TINAP-30-5",
    "TCE | TINA-PS",
    "TCE | TRNEY-22",
    "TCE | TURNEY-PS",
    "TCE | WALHL-19",
    "TCE | WELWD-08",
    "TCE | WELWD-23",
    "TCE | WELWD-35",
    "TCE | WHITEWOOD-PS",
    "TCE | WILBER-PS",
    "TCE | WLBER-9",
    "TCE | WTWOD-24",
    "TCE | BANNER-CS",
    "TCE | BRINKER-CS",
    "TCE | BRUCETONMLS-CS",
    "TCE | BUTTERMILK-CS",
    "TCE | CANE RIDGE-CS",
    "TCE | CLFTN-JCT-CS",
    "TCE | CORINTH-CS",
    "TCE | DEFEAT-BRANCH",
    "TCE | DUNDEE-CS",
    "TCE | FRANKLIN-C",
    "TCE | GOOD LUCK-CS",
    "TCE | HAMLIN-CS",
    "TCE | HOLCOMB-CS",
    "TCE | HUBBALL-CS",
    "TCE | INVERNESS-CS",
    "TCE | IOWASTATION-CS",
    "TCE | LOST-RIVER-CS",
    "TCE | MOREHEAD-CS",
    "TCE | MOUNT OLIVE-CS",
    "TCE | MVIL-TRSL-FARM",
    "TCE | NEW ALBANY-CS",
    "TCE | NMS BLUESTONE",
    "TCE | NMS RE WSHTN",
    "TCE | NYS-CS",
    "TCE | PAINT LICK-CS",
    "TCE | SAUNDERSCRK",
    "TCE | SHERWOOD-CS",
    "TCE | STATIONCAMP",
    "TCE | WALGROVE-CS",
    "TCE | WESTTOWN-M-R",
    "TCE | WHITE OAK-CS",
    "TCE | BGAN-001",
    "TCE | BGAN-002",
    "TCE | BGAN-003",
    "TCE | BGAN-004",
    "TCE | BGAN-005",
    "TCE | BGAN-006",
    "TCE | BGAN-007",
    "TCE | BGAN-008",
    "TCE | BGAN-009",
    "TCE | BGAN-010",
    "TCE | BGAN-011",
    "TCE | BGAN-012",
    "TCE | BGAN-013",
    "TCE | BGAN-014",
    "TCE | BGAN-015",
    "TCE | BGAN-016",
    "TCE | BGAN-017",
    "TCE | BGAN-018",
    "TCE | BGAN-019",
    "TCE | XLSITE1",
    "TCE | ARNEGARD-CS04",
    "TCE | CHANNAHON-MS",
    "TCE | CLARK-CS10",
    "TCE | DES-PLAINES-CS",
    "TCE | ELDRIDGE-CS17",
    "TCE | GLEN-ULLN-CS06",
    "TCE | GRUNDY-CT-CS14",
    "TCE | LA-MOILLE-CS18",
    "TCE | LONE-TREE-CS16",
    "TCE | MANNING-CS05",
    "TCE | ALXLA",
    "TCE | ANADARK-640617",
    "TCE | ANCHOR HOCKING",
    "TCE | ANTERO-ENERGY",
    "TCE | ASHLAND BLKBRY",
    "TCE | ATHENS E62 MS",
    "TCE | BELLVIEW708038",
    "TCE | BERLIN",
    "TCE | BERYL 600343",
    "TCE | BLUESTONE",
    "TCE | BOWLING D423",
    "TCE | BOWLING D605",
    "TCE | BOYLES-METER",
    "TCE | BROADWAY EM MS",
    "TCE | BRUNETT-OIL",
    "TCE | CANFIELD MS",
    "TCE | CANONSBURG",
    "TCE | CAREY D35 MS",
    "TCE | CENTRAL AVE MS",
    "TCE | CHARLS",
    "TCE | CHIEF-OIL",
    "TCE | CHILLCOTHE CMS",
    "TCE | CIRCLEVILLE MS",
    "TCE | CLYDE D-53",
    "TCE | CNTRVLE CTL",
    "TCE | CNX-ALTON",
    "TCE | COLD SPRING MS",
    "TCE | COVINGTON RTU",
    "TCE | CRCLVILLE MS",
    "TCE | CULPEPER MS",
    "TCE | DELMARVA",
    "TCE | DICKSCREEK",
    "TCE | DPL POD",
    "TCE | DYKE RD MS",
    "TCE | EASTON",
    "TCE | EQT-CANADA",
    "TCE | FOSTORIA MS MS",
    "TCE | FRANKFORT SPRS",
    "TCE | FRANKLIN EM MS",
    "TCE | FRANKLIN-G",
    "TCE | FRANKLIN POD",
    "TCE | GALLIPOLIS POD",
    "TCE | GREENUP MS",
    "TCE | HARRISONBURG",
    "TCE | HIGHLAND",
    "TCE | HURON D-32",
    "TCE | JAMESTOWN EM",
    "TCE | JAYBEE",
    "TCE | KING-CYGNET",
    "TCE | LAFAYETTE",
    "TCE | LANCASTER 1",
    "TCE | LANCASTER 5 MS",
    "TCE | LEBANON",
    "TCE | LIME CITY",
    "TCE | LITITZ PS MS",
    "TCE | LONDON Z49 MS",
    "TCE | MARION D-325",
    "TCE | MARKWEST642437",
    "TCE | MAUMEE",
    "TCE | MEDINA WEST",
    "TCE | MONCLOVA ODOR",
    "TCE | MOOREFIELD MS",
    "TCE | MOUNTAIN-V",
    "TCE | MS640563",
    "TCE | MS706502",
    "TCE | MS 706991",
    "TCE | MS712216",
    "TCE | MS 828441",
    "TCE | MUNCY",
    "TCE | MVILLEGRNFIELD",
    "TCE | NEWARK K32 MS",
    "TCE | NEW BOSTON MS",
    "TCE | NGO GREEN MS",
    "TCE | NORTH RD",
    "TCE | PETROEDGE",
    "TCE | PICKNPAW",
    "TCE | RANGE-AMWELL",
    "TCE | RDAYFARM",
    "TCE | REDDFARM RMF",
    "TCE | RICE-DRILLING",
    "TCE | RICE-MS642569",
    "TCE | SALEM FRANKLIN",
    "TCE | SALEM WEST EM",
    "TCE | SANDUSKY MS",
    "TCE | S STREET EM",
    "TCE | STAGECOACH",
    "TCE | STRONGVILLE MS",
    "TCE | SWEDESBORO NJ1",
    "TCE | TANNEHILL",
    "TCE | TIFFIN D-31 MS",
    "TCE | TITANIUM MTL",
    "TCE | UPR SANDUSKY",
    "TCE | URBANA Z8 MS",
    "TCE | WALBRIDGE CS",
    "TCE | WAYNE",
    "TCE | WCHDRY",
    "TCE | WHITE FARM",
    "TCE | WHITELY",
    "TCE | WILLIAM-BROWN",
    "TCE | WILLIAMS POD",
    "TCE | WILLIAMS-REX",
    "TCE | ADAMSVILLE",
    "TCE | ADELINE CS",
    "TCE | ARLINGTON MS",
    "TCE | ARTEMAS 1 CS",
    "TCE | BANNERPONTOTOC",
    "TCE | BEAVER CREEK",
    "TCE | BENTON CS",
    "TCE | BLUESTON642638",
    "TCE | BROAD RUN",
    "TCE | CAIMAN",
    "TCE | CAIMEN PENN",
    "TCE | CAMPBELL O G",
    "TCE | CARBONLIMESTON",
    "TCE | CATATONK MS",
    "TCE | CHIEF-MILKYSK",
    "TCE | CLEARFIELD",
    "TCE | CLEMENTSVL CS",
    "TCE | COAL MOUNTAIN",
    "TCE | COBB CS",
    "TCE | CORINTH",
    "TCE | CRAWFORD CS",
    "TCE | DELHI-RADIO",
    "TCE | DELMONT CS",
    "TCE | DEO METER",
    "TCE | DLVRY-MTR-DOM",
    "TCE | D-MTR-TCO-SEII",
    "TCE | DONEGAL CS",
    "TCE | ECV VERES",
    "TCE | ELKINS M-R",
    "TCE | ELLWOOD CTY CS",
    "TCE | EQT-HURD SEII",
    "TCE | FILES CREEK CS",
    "TCE | FIRST ENERGY",
    "TCE | FLATTOP",
    "TCE | FRAMETOWN-CS",
    "TCE | GALA CS",
    "TCE | GIBRALTAR SWN",
    "TCE | GLADY",
    "TCE | GOOCHLAND CS",
    "TCE | GREELY CHAPEL",
    "TCE | GREENWOOD",
    "TCE | HAMPSHIRE CS",
    "TCE | HAMRD-CPG",
    "TCE | HANCOCK SE II",
    "TCE | HARTSVILLE-B",
    "TCE | HARTSVILLE-D",
    "TCE | HARTSVILLE-F",
    "TCE | HEROJOLLY",
    "TCE | HKRY-BD-CS-SE2",
    "TCE | HOLDING PNT",
    "TCE | HOLMES CS",
    "TCE | HOUMA-B",
    "TCE | HOUMA-C",
    "TCE | HOUMA-CS",
    "TCE | HOWELL MS",
    "TCE | JEFFRIES PAD",
    "TCE | JENNINGS-TOWER",
    "TCE | KIRKWOOD M-R",
    "TCE | K MORGAN NMS",
    "TCE | KNIFLEY",
    "TCE | KOT FOSTER",
    "TCE | LAKE ARTHUR CS",
    "TCE | LANHAM-CS",
    "TCE | LAURALSTRGESE2",
    "TCE | LOAN OAK CS",
    "TCE | LOUISA CS",
    "TCE | LOUISA CS2",
    "TCE | LOWRY",
    "TCE | LUCAS CS",
    "TCE | M3 METER",
    "TCE | MARIETTA CS",
    "TCE | MARKWEST642444",
    "TCE | MARTIN_WELL",
    "TCE | MARYSVILLE TB",
    "TCE | MCARTHUR CS",
    "TCE | MEANS CS",
    "TCE | MLV-1011",
    "TCE | MLV-1012",
    "TCE | MLV-1015",
    "TCE | MLV-1016",
    "TCE | MLV-1017A",
    "TCE | MLV-1019",
    "TCE | MLV-1021",
    "TCE | MLV-1025",
    "TCE | MS401-SE2",
    "TCE | MS445-SE2",
    "TCE | MS621333",
    "TCE | MS642436",
    "TCE | MS804933 HCANE",
    "TCE | MT-GATHER-XTO",
    "TCE | NATIONAL FUEL",
    "TCE | NINEVEH MS",
    "TCE | NIXON FARM",
    "TCE | NMS JEF MNTGRY",
    "TCE | NMS KENSINGTON",
    "TCE | NMS LARMON",
    "TCE | NMS MLBV 10",
    "TCE | NMS MLBV2",
    "TCE | NMS MLBV3",
    "TCE | NMS MLBV4",
    "TCE | NMS MLBV5-6",
    "TCE | NMS MLBV7",
    "TCE | NMS MLBV 8",
    "TCE | NMS MLBV 9",
    "TCE | NMS M SIEGA",
    "TCE | NMS PULASKI",
    "TCE | NMS SUPERIOR",
    "TCE | N RAVENSWOOD",
    "TCE | OAK HILL CS",
    "TCE | PATTERSON FORK",
    "TCE | PLAINS P-INTCT",
    "TCE | PLEASANT EXCH",
    "TCE | PMONT INTRCNT",
    "TCE | RAYNE-E",
    "TCE | RECPT-MTR-XTO",
    "TCE | RIDGEVALV1010B",
    "TCE | RIPLEY CS SEII",
    "TCE | ROCK-TEN-CPG",
    "TCE | ROCKY HOLLOW",
    "TCE | ROVER REG",
    "TCE | SALISBURY SE2",
    "TCE | SCHERERVLLE CS",
    "TCE | SM86 PATTERSON",
    "TCE | SOUTH MEANS",
    "TCE | SPECTRA-TET",
    "TCE | SPEEDWELL-MS41",
    "TCE | SPENCER M R",
    "TCE | STANTON-D",
    "TCE | STANTON-F",
    "TCE | STRABANE NORTH",
    "TCE | TERRA ALTA CS",
    "TCE | TETCON",
    "TCE | TUXEDO",
    "TCE | VS1011",
    "TCE | VS313",
    "TCE | WAGONER",
    "TCE | WELLINGTON CS",
    "TCE | WESTDEPFORDSE2",
    "TCE | WESTTOWN M-R",
    "TCE | XTO BOWSER",
    "TCE | XTO HARVEY",
    "TCE | ACADIAN",
    "TCE | ALIANCE WLF MS",
    "TCE | ALXDRA LA CS2",
    "TCE | ALXKY",
    "TCE | ANADARK-640616",
    "TCE | ANSHUTZ-EXP",
    "TCE | APPALACHIAN",
    "TCE | ATMOS-LEFLORE",
    "TCE | BANNER-TOYOTA",
    "TCE | BAY VILLAGE",
    "TCE | BENTON MS",
    "TCE | BENTON REG",
    "TCE | BICKERS-CS",
    "TCE | BIER WELL PAD",
    "TCE | BIG PINE CS",
    "TCE | BIG SANDY",
    "TCE | BOLDMAN CS",
    "TCE | BOSWELLS CS",
    "TCE | BOWLINE-1",
    "TCE | BUZZARD",
    "TCE | CEDAR CREEK",
    "TCE | CEREDO-CS",
    "TCE | CHARLS-TEST",
    "TCE | CHESAPEAKE-LNG",
    "TCE | CLEMENTSVILLE",
    "TCE | CLENDENIN-CS",
    "TCE | CLEVELAND CS",
    "TCE | COCO-CS",
    "TCE | CONEMAUGH",
    "TCE | CORNING CS",
    "TCE | COXENDALE CPG",
    "TCE | DELHI-B",
    "TCE | DEPOSIT",
    "TCE | DINK VS",
    "TCE | DOWNINGTON CS",
    "TCE | DTI CORNWELL",
    "TCE | DWALE MS808220",
    "TCE | DYSART VS",
    "TCE | EAGLE-CS",
    "TCE | EASTON CS",
    "TCE | ELK RIVER CS",
    "TCE | ENDICOTT MANDR",
    "TCE | EQT HUEY MS",
    "TCE | EUREKA HTR SE2",
    "TCE | FORT-HENRY",
    "TCE | FRANKLIN-D",
    "TCE | FRANKLIN-F",
    "TCE | FREDERICK BRIN",
    "TCE | FREE UNION MR",
    "TCE | GBERT MS634545",
    "TCE | GETTYSBURG-CS",
    "TCE | GIBRALTAR RE",
    "TCE | GLADY VS",
    "TCE | GLENVIEW CS",
    "TCE | GRANT CS",
    "TCE | GRAYSON CS",
    "TCE | GREENCASTLE-CS",
    "TCE | HAMLN",
    "TCE | HARDY CS",
    "TCE | HARTSVILLE-C",
    "TCE | HARTSVILLE CS",
    "TCE | HARTSVILLE-E",
    "TCE | HARTSVILLE-G",
    "TCE | HARTSVILLE-H",
    "TCE | HELLERTOWN-CS",
    "TCE | HOLLOBAUGH",
    "TCE | HOPEWELL MS",
    "TCE | HORSECREEK CS",
    "TCE | HOUMA-E",
    "TCE | HOUMA-TWR",
    "TCE | HUFF-CREEK-CS",
    "TCE | HUTTONMS642449",
    "TCE | ISOLA",
    "TCE | KENOVA CS",
    "TCE | KINDER",
    "TCE | LAFAYETTE MS41",
    "TCE | LASERMIDSTREAM",
    "TCE | LCUSTPT 604626",
    "TCE | LEACH-D",
    "TCE | LEEVILLE",
    "TCE | LEWISRUN",
    "TCE | LINE J",
    "TCE | LINE W",
    "TCE | LOUDOUN CS",
    "TCE | LYTLE",
    "TCE | MAJORSVILLE-CS",
    "TCE | MARK WEST POD",
    "TCE | MAUGANSVILLE",
    "TCE | MCARTHUR 2 MS",
    "TCE | MILEY-CS",
    "TCE | MILFORD CS",
    "TCE | MINISINK-CS",
    "TCE | MJORSVIL-PGWYE",
    "TCE | MLV-1020",
    "TCE | MLV-1024",
    "TCE | M R 63882",
    "TCE | MS-4119",
    "TCE | MS629898 SWEDE",
    "TCE | MS 642739",
    "TCE | MS642831",
    "TCE | MS643009",
    "TCE | MT UNION MS804",
    "TCE | MVILLE-BELL-A",
    "TCE | MVILLE-PIG-1-A",
    "TCE | MVILLE-PIG-2-A",
    "TCE | MVILLE-WIND-A",
    "TCE | MVILLE-WIND-B",
    "TCE | MWEST-SHERWOOD",
    "TCE | PANTHER MTN",
    "TCE | PARMA-L-CPG",
    "TCE | PAVONIA CS",
    "TCE | PECAN",
    "TCE | PENNESBURG MS",
    "TCE | PETERSBURG CS",
    "TCE | PLEASANT HIL1",
    "TCE | PORT DICKSON",
    "TCE | QUAKERTOWN MS",
    "TCE | RAMAPO",
    "TCE | RAYNE-ATT",
    "TCE | RAYNE-CMPRSSR",
    "TCE | RAYNE-F",
    "TCE | REDD FARM CS",
    "TCE | RENOVO CS",
    "TCE | ROCKPORT CS",
    "TCE | RUTLEDGE CS",
    "TCE | SANDYVILLE",
    "TCE | SCOTTSBRANCH",
    "TCE | SENECA-CS",
    "TCE | SHENANDOAH-CS",
    "TCE | SLOATESBURG",
    "TCE | SM-102 DUMP",
    "TCE | SMITHFIELD CS",
    "TCE | SOMERSET-CPG",
    "TCE | STANTON-B",
    "TCE | STANTON-CS",
    "TCE | STONEWALL GAS",
    "TCE | STONEWALL METE",
    "TCE | STRASBURG-CS",
    "TCE | SUMMERVILLE CS",
    "TCE | TAYLOR-RD-CPG",
    "TCE | UNIONVILLE TN",
    "TCE | VAN-METER-CPG",
    "TCE | VEPCO MR",
    "TCE | VS-113",
    "TCE | VS-912FT-NECES",
    "TCE | VS-914-UNION-C",
    "TCE | WAYNESBURG-CS",
    "TCE | WEAVER CS",
    "TCE | WESTDEFORD MS",
    "TCE | WEST SENECA",
    "TCE | ZEDIKER MS",
    "TCE | AGAWAM-GATE",
    "TCE | AGRICOLA POD",
    "TCE | ALTA VISTA",
    "TCE | ANDOVER GATE",
    "TCE | ANR FREEMONT",
    "TCE | ANR MICH CITY",
    "TCE | ANR MONROE",
    "TCE | ANR ORLAND",
    "TCE | ATTLEBOROUGH G",
    "TCE | BAILEY GEN RCV",
    "TCE | BARTON",
    "TCE | BEAR-GARDEN-MR",
    "TCE | BEAR-GARDEN-PD",
    "TCE | BESSEMER",
    "TCE | BETHLEHAM",
    "TCE | BETHLEHAM 2",
    "TCE | BLACKHAWK-CS",
    "TCE | BOWER HILL POD",
    "TCE | BP AMOCO-SE2",
    "TCE | BRADFORDWOODS",
    "TCE | BRM-BF-GMB-SE2",
    "TCE | BROOKNEAL POD",
    "TCE | BURLINGTON POD",
    "TCE | CANTON GATE",
    "TCE | CATATONK",
    "TCE | CELANSES GMB",
    "TCE | CHAMBERSBURG",
    "TCE | CHESTER POD",
    "TCE | CHILLICOTHE PD",
    "TCE | CHNCLLR-PD-SE2",
    "TCE | COLONIAL",
    "TCE | COTTER",
    "TCE | COXENDALE SEII",
    "TCE | CR 500 POD",
    "TCE | CR ALBION POD",
    "TCE | CRANEY-ISLAND",
    "TCE | CROSSROADS AUB",
    "TCE | CRSRDS-NAP-SE2",
    "TCE | CULPEPER",
    "TCE | DAIRY LANE POD",
    "TCE | DISPUTANTA POD",
    "TCE | DVR-CTR-PD-SE2",
    "TCE | DYER RD REG",
    "TCE | EDGARTON POD",
    "TCE | EDOM-POD-SE2",
    "TCE | EMERGENCY-ES9",
    "TCE | EMERGENCY-S1",
    "TCE | EMIGSVILLE POD",
    "TCE | FAIR OAKS POD",
    "TCE | FAIRWOOD-POD",
    "TCE | FISHER RD POD",
    "TCE | FORT HILL REG",
    "TCE | FORT LEE",
    "TCE | FT WAYNE ANR",
    "TCE | GELP",
    "NIS | GLATFELTER GMB",
    "NIS | GNDR-RD-PD-SE2",
    "NIS | GOAT HILL",
    "NIS | GOOSECREEK POD",
    "NIS | GROVETON",
    "NIS | HANSON REG STA",
    "NIS | HEIDLEBURG",
    "NIS | HIGHLAND JCT",
    "NIS | HLT",
    "NIS | HOFFMAN FARMS",
    "NIS | I90 REGULATORA",
    "NIS | IN HARBOR",
    "NIS | INLAND-SE2",
    "NIS | JIM BEAM SE II",
    "NIS | JOHNSON RD POD",
    "NIS | LACOCK",
    "NIS | LADYSMITH",
    "NIS | LAGRNGE-PD-SE2",
    "NIS | LAKE CARNICO",
    "NIS | LAKETON ST",
    "NIS | LAKETON-SE2",
    "NIS | LALLENDORF POD",
    "NIS | LAMBERT POD",
    "NIS | LAWRNC-GAT-SE2",
    "NIS | LDN",
    "NIS | LEXINGTON POD",
    "NIS | LEXINGTON PROP",
    "NIS | LIB",
    "NIS | LORAIN W NGD",
    "NIS | LTV-STEEL-SE2",
    "NIS | LUDLOW",
    "NIS | LYNCHBURG POD",
    "NIS | MARATHON",
    "NIS | MARBLE",
    "NIS | MAVITY-POD",
    "NIS | MAYFLOWER-SE2",
    "NIS | MCNGHTN-RD-SE2",
    "NIS | MEDINA-WEST",
    "NIS | MEDWAY-GATE",
    "NIS | MIDWEST STEEL",
    "NIS | MISS ST RCV",
    "NIS | MONACA",
    "NIS | MONGO-POD-SE2",
    "NIS | MONROE-LASKEY",
    "NIS | MONROEVILLEPOD",
    "NIS | NAL",
    "NIS | NEW MARKET",
    "NIS | NEW MICHIGAN R",
    "NIS | NHAYDEN-PD-SE2",
    "NIS | NOTRE DAME GMB",
    "NIS | NS TANHILL POD",
    "NIS | ORG",
    "NIS | OSRAM POD",
    "NIS | PANHANDLE DECA",
    "NIS | PANHANDLE-POD",
    "NIS | PARMA L 2305",
    "NIS | PATRIOT PARK",
    "NIS | PH BLUFFTON 2",
    "NIS | PICKAWAY TET",
    "NIS | PLEASANT GAP",
    "NIS | POD 117",
    "NIS | PORTER RD",
    "NIS | PORTSMOUTH",
    "NIS | PRINCE WLM POD",
    "NIS | PULASKI",
    "NIS | PUNCH-BOWL-POD",
    "NIS | REMINGTON POD",
    "NIS | RMS GEN STA",
    "NIS | ROCHESTER CTRL",
    "NIS | ROCK TENN POD",
    "NIS | ROLLING HILLS",
    "NIS | ROME HILLARD",
    "NIS | ROYAL CNTR CV",
    "NIS | RT27",
    "NIS | RT89-POD",
    "NIS | SALISBURG SE2",
    "NIS | SALM-CHWNG-SE2",
    "NIS | SCOTBRANCHVZW",
    "NIS | SCOTTSVILLEPOD",
    "NIS | SD BUTLER POD",
    "NIS | SEII",
    "NIS | SEII-VERIZON",
    "NIS | SOFIELD GMB",
    "NIS | SOMERSET",
    "NIS | SPOTSYLVANIA-P",
    "NIS | ST JAMES DR",
    "NIS | ST RT 114-SE2",
    "NIS | STEEL-DYN-SE2",
    "NIS | STEPSTONE POD",
    "NIS | STILLEY",
    "NIS | STVITUS-1",
    "NIS | SWACO-POD-SE2",
    "NIS | SWEDESBORO",
    "NIS | TASSINONG-SE2",
    "NIS | TAUNTON GATE",
    "NIS | TAYLOR-RD-POD",
    "NIS | TIPTON",
    "NIS | TOYOTA POD",
    "NIS | TR VISTULA",
    "NIS | TREMONT RCV",
    "NIS | TRIANAMS",
    "NIS | TRK-BREMEN-SE2",
    "NIS | TRK-DUNLAP-SE2",
    "NIS | TRK-GODLND-SE2",
    "NIS | TURNER ROAD",
    "NIS | TYREANNA REG S",
    "NIS | UNNTWN-TET-SE2",
    "NIS | US-STEEL-SE2",
    "NIS | VANMETER-RD-SE",
    "NIS | VEC-CRN-PT-SE2",
    "NIS | VECTOR-SE2",
    "NIS | VIRGINIA FIBRE",
    "NIS | WALLACE",
    "NIS | WASH JCT POD",
    "NIS | WASHJCT",
    "NIS | WESTDEPFORD MS",
    "NIS | WHITELYCR-VZW",
    "NIS | WHITING-SE2",
    "NIS | WINDY RIDGE",
    "NIS | WOLCOTTVLE-SE2",
    "NIS | YORK RD SEII",
    "NIS | ZHILMAN"
];