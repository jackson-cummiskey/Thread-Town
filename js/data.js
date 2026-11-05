/* Thread Town: departments, seed agents, and fake task library.
   Edit this file to change the roster. Everything else reads from it. */
window.TT = window.TT || {};
/* Resolved by the renderer module once TT.town exists. The UI waits on it. */
TT.ready = new Promise(function (resolve) { TT._readyResolve = resolve; });

/* Each department owns one lot in the city plan (js/cityplan.js, kind dept:<id>); placement
   comes from the plan, not from this file.
   accent = roof and door color. alien = body color for every agent on that team.
   footprint = building size in tiles (max 12 by 7). station = which side of the stub
   path the outdoor work station sits on. activity = the signature work activity id,
   matched by the department module in js/depts/<id>.js. Values fixed by docs/CONTRACT_V2.md. */
TT.DEPARTMENTS = [
  { id: 'exec',       name: 'Executive',         short: 'Exec',       accent: '#002D4F', wall: '#F3EFE6', roof: '#1C3B5E', alien: '#3B6E9E',
    footprint: { w: 12, h: 7 }, station: 'right', activity: 'podium' },
  { id: 'embedded',   name: 'Embedded Banking',  short: 'Embedded',   accent: '#75CCD0', wall: '#EDE7D8', roof: '#24466A', alien: '#75CCD0',
    footprint: { w: 10, h: 6 }, station: 'right', activity: 'switchboard' },
  { id: 'compliance', name: 'Compliance',        short: 'Compliance', accent: '#004B91', wall: '#E8E2D5', roof: '#1F3A5A', alien: '#4A8FE0',
    footprint: { w: 10, h: 6 }, station: 'left',  activity: 'stamp' },
  { id: 'fcc',        name: 'Financial Crimes',  short: 'FCC',        accent: '#E7706F', wall: '#EFE8DA', roof: '#2A4567', alien: '#E7706F',
    footprint: { w: 9,  h: 6 }, station: 'right', activity: 'watchtower' },
  { id: 'ops',        name: 'Operations',        short: 'Ops',        accent: '#1F8A5B', wall: '#ECE5D4', roof: '#203E60', alien: '#34A872',
    footprint: { w: 11, h: 6 }, station: 'left',  activity: 'crane' },
  { id: 'data',       name: 'Data & Analytics',  short: 'Data',       accent: '#5D4E8E', wall: '#E9E3D6', roof: '#1D3A5C', alien: '#8E7BD0',
    footprint: { w: 9,  h: 6 }, station: 'right', activity: 'telescope' },
  { id: 'credit',     name: 'Credit',            short: 'Credit',     accent: '#C68B17', wall: '#F0E9DB', roof: '#264768', alien: '#E0A838',
    footprint: { w: 10, h: 6 }, station: 'left',  activity: 'vault' },
  { id: 'finance',    name: 'Accounting',        short: 'Accounting',    accent: '#2E8B8E', wall: '#EBE4D5', roof: '#1E3C5E', alien: '#3AA8AB',
    footprint: { w: 8,  h: 6 }, station: 'right', activity: 'ticker' },
  { id: 'tech',       name: 'Technology',        short: 'Tech',       accent: '#A85B8E', wall: '#E7E1D4', roof: '#22416A', alien: '#C972AC',
    footprint: { w: 11, h: 6 }, station: 'left',  activity: 'workstation' },
  { id: 'risk',       name: 'Risk',              short: 'Risk',       accent: '#C05E2C', wall: '#EEE7D9', roof: '#1B385A', alien: '#E07E42',
    footprint: { w: 12, h: 7 }, station: 'right', activity: 'tightrope', characters: 'animals' },
  { id: 'marketing',  name: 'Marketing',         short: 'Marketing',  accent: '#8DBE2E', wall: '#F1EADC', roof: '#254566', alien: '#9FCB3E',
    footprint: { w: 10, h: 6 }, station: 'left',  activity: 'hoops' },
  { id: 'people',     name: 'People',            short: 'People',     accent: '#B9C4CC', wall: '#EAE3D5', roof: '#1F3D5F', alien: '#AEB9C2',
    footprint: { w: 9,  h: 5 }, station: 'right', activity: 'swings' },
];

/* Seed roster. owner = who registered the agent. demo = true means it is placeholder
   data to show what a populated town looks like; real ones map to Jackson's routines and skills. */
TT.SEED_AGENTS = [
  { id: 'deck',    name: 'Zorp',  role: 'Deck Stamper',       dept: 'embedded',   owner: 'Jackson C.',   cadence: 'Fridays 9:00am', since: 'Sep 2026',
    about: 'Restamps and files the weekly Partnership Pipeline Review deck.', anim: 'build' },
  { id: 'digest',  name: 'Quill', role: 'Fintech Newsie',     dept: 'embedded',   owner: 'Jackson C.',   cadence: 'Mon / Wed / Fri', since: 'Aug 2026',
    about: 'Reads the Fintech Newsletters folder and writes the partner digest PDF.', anim: 'write' },
  { id: 'temp',    name: 'Blip',  role: 'Temp Limit Filer',   dept: 'ops',        owner: 'Jackson C.',   cadence: 'On request', since: 'Sep 2026',
    about: 'Turns Unit temporary limit request forms into Asana tasks.', anim: 'stamp' },
  { id: 'feature', name: 'Nova',  role: 'Feature Request Clerk', dept: 'ops',     owner: 'Jackson C.',   cadence: 'On request', since: 'Sep 2026',
    about: 'Files client feature and exception requests to the EB board.', anim: 'stamp' },
  { id: 'mail',    name: 'Oona',  role: 'Questionnaire Mailer', dept: 'embedded', owner: 'Jackson C.',   cadence: 'Quarterly', since: 'Sep 2026',
    about: 'Drafts and tracks client questionnaire emails.', anim: 'mail' },
  { id: 'ocr',     name: 'Vex',   role: 'Scanner',            dept: 'ops',        owner: 'Jackson C.',   cadence: 'On upload', since: 'Jul 2026',
    about: 'OCRs uploaded reports and loan packages before review.', anim: 'scan' },

  { id: 'd1', demo: true, name: 'Glorb', role: 'Alert Triager',     dept: 'fcc',        owner: 'Demo',  cadence: 'Hourly', since: 'Demo',
    about: 'Pre-sorts transaction monitoring alerts and drafts case notes.', anim: 'scan' },
  { id: 'd2', demo: true, name: 'Mox',   role: 'Policy Grader',     dept: 'compliance', owner: 'Demo',  cadence: 'On request', since: 'Demo',
    about: 'Grades partner policies against the FT Partner Guidelines.', anim: 'write' },
  { id: 'd3', demo: true, name: 'Tally', role: 'Recon Runner',      dept: 'finance',    owner: 'Demo',  cadence: 'Daily 6:00am', since: 'Demo',
    about: 'Reconciles the GL against the core batch status report.', anim: 'compute' },
  { id: 'd4', demo: true, name: 'Ixi',   role: 'Report Builder',    dept: 'data',       owner: 'Demo',  cadence: 'Daily 7:00am', since: 'Demo',
    about: 'Refreshes the daily DDA and COD dashboards.', anim: 'compute' },
  { id: 'd5', demo: true, name: 'Pim',   role: 'Memo Drafter',      dept: 'credit',     owner: 'Demo',  cadence: 'On request', since: 'Demo',
    about: 'Drafts first-pass credit memos from the loan package.', anim: 'write' },
  { id: 'd6', demo: true, name: 'Rue',   role: 'Status Scribe',     dept: 'exec',       owner: 'Demo',  cadence: 'Mondays', since: 'Demo',
    about: 'Compiles the weekly executive status from Asana.', anim: 'write' },
  { id: 'd7', demo: true, name: 'Kib',   role: 'Patch Watcher',     dept: 'tech',       owner: 'Demo',  cadence: 'Nightly', since: 'Demo',
    about: 'Reviews dependency updates and opens patch tickets.', anim: 'build' },
  { id: 'd8', demo: true, name: 'Fen',   role: 'Brand Checker',     dept: 'marketing',  owner: 'Demo',  cadence: 'On request', since: 'Demo',
    about: 'Checks partner marketing copy against the brand guidelines.', anim: 'scan' },
  { id: 'd9',  demo: true, name: 'Otter',    role: 'Liquidity Watcher', dept: 'risk',       owner: 'Demo',  cadence: 'Daily 6:30am', since: 'Demo',
    about: 'Watches intraday liquidity and flags shortfalls early.', anim: 'compute' },
  { id: 'd10', demo: true, name: 'Falcon',   role: 'Market Risk Scout', dept: 'risk',       owner: 'Demo',  cadence: 'Hourly', since: 'Demo',
    about: 'Scans rate moves and reprices the risk dashboards.', anim: 'scan' },
  { id: 'd11', demo: true, name: 'Tortoise', role: 'Model Validator',   dept: 'risk',       owner: 'Demo',  cadence: 'Mondays', since: 'Demo',
    about: 'Re-tests the models against last week\'s actuals.', anim: 'write' },
];

/* Task phrases per animation style. Picked at random when the simulator starts a run. */
TT.TASKS = {
  build:   [ ['Restamping the pipeline deck', 'Deck filed to October 2026'],
             ['Checking dependency updates', '3 patch tickets opened'],
             ['Rebuilding the weekly export', 'Export rebuilt, 0 errors'] ],
  write:   [ ['Writing the digest', 'Digest PDF ready, 14 stories'],
             ['Drafting the credit memo', 'Memo draft sent for review'],
             ['Compiling exec status', 'Status posted to Asana'],
             ['Grading partner policy set', 'Scorecard: 9 of 11 pass'] ],
  stamp:   [ ['Filing a temp limit request', 'Task created in Temp Limits BSA'],
             ['Logging a feature request', 'Task assigned to Client Manager'],
             ['Routing an exception form', 'Routed to Post Approval Requests'] ],
  mail:    [ ['Drafting questionnaire emails', '12 drafts ready to send'],
             ['Tracking questionnaire replies', '8 of 12 partners responded'] ],
  scan:    [ ['Scanning a loan package', '7 documents OCRd at 98%'],
             ['Triaging monitoring alerts', '31 alerts sorted, 4 escalated'],
             ['Checking marketing copy', '2 claims flagged for review'] ],
  compute: [ ['Reconciling GL to core', 'Balanced to the penny'],
             ['Refreshing DDA dashboard', 'Dashboard refreshed 7:02am'],
             ['Recomputing deposit mix', 'Mix updated, no breaks'] ],
};

TT.FAIL_RESULTS = [
  'Folder not reachable, retry queued',
  'Source file missing, flagged for a human',
  'Connector timed out, will retry in 1 hour',
];
