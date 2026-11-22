// The town's car places, in one list for the respray shops now and the garage upgrades later (Round D).
// Each is a real business's real address, geocoded with the project's G-NAF index (viewer/residents/data/addresses.json,
// Open G-NAF, CC BY 4.0) and projected like tools/build_map.mjs; the game snaps it to the building footprint there and
// the nearest road. The names in the game are invented: friendly local twists, no real names or logos.
//   does: 'respray' (drive in, stop, a new colour for $25), 'tyres' (drive in: a flat fixed for $10), and later
//   'wrap', 'grip', 'parts' for the upgrade screen. kind says what the real place is.
// Car washes come from OpenStreetMap (map.json carPlaces) and are places to wash off the heat, not resprays.
'use strict';
(function (VH) {
  VH.GARAGES = [
    { id: 'g-hindmarsh-tune', name: 'ULTRA TUNE-UP', kind: 'mechanic', does: ['respray'], at: [4799.4, 2315.4], address: '167 Hindmarsh Road, Victor Harbor', source: 'public map listing' },
    { id: 'g-maude-mastas', name: 'AUTO MASTAS', kind: 'mechanic', does: ['respray'], at: [2722.1, 2999.9], address: '66 Maude Street, Victor Harbor', source: 'public map listing' },
    { id: 'g-mayfield-smash', name: 'FLEURIEU SMASH', kind: 'smash repairs', does: ['respray'], at: [2838.9, 3022.0], address: '35 Mayfield Terrace, Victor Harbor', source: 'MapQuest listing; SA Fleet Agency accredited crash repairers list (2022)' },
    { id: 'g-maude-spanners', name: 'MAUDE ST SPANNERS', kind: 'mechanic', does: ['respray'], at: [2817.2, 3097.2], address: '50-54 Maude Street, Victor Harbor', source: 'repcoservice.com listing for the authorised service centre there' },
    { id: 'g-adelaide-motors', name: 'FLEURIEU MOTOR MOB', kind: 'car dealer and service centre', does: ['respray'], wraps: true, at: [6152.3, 143.7], address: '38 Adelaide Road, Hayborough', source: 'public map listing' },
    { id: 'g-hindmarsh-tyres', name: 'VICTOR TYRE POWER', kind: 'tyres', does: ['tyres'], at: [4829.3, 2270.1], address: '161 Hindmarsh Road, Victor Harbor', source: 'the tyre company\'s store page' },
    { id: 'g-victoria-treads', name: 'VICTA TREADS', kind: 'tyres', does: ['tyres'], at: [4112.1, 3104.9], address: '86 Victoria Street, Victor Harbor (listed as 86-90)', source: 'AutoGuru and Autohero listings' },
    // still to place (no address found yet): the parts shop on the McCracken side, the towing and recovery yard and a
    // car-care place in the Maude Street cluster. Add them here with `at` when their addresses are known.
  ];
})(window.VH);
