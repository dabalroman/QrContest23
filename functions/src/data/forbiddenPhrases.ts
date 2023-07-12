const forbiddenPhrases = [
    'arse',
    'asshole',
    'bastard',
    'bawbag',
    'bellend',
    'bitch',
    'bitchtits',
    'bollocks',
    'bugger',
    'choad',
    'chuj',
    'ciota',
    'cipa',
    'cipach',
    'cipami',
    'cipce',
    'cipe',
    'cipek',
    'cipie',
    'cipka',
    'cipkach',
    'cipkami',
    'cipki',
    'cipko',
    'cipkom',
    'cipką',
    'cipkę',
    'cipo',
    'cipom',
    'cipy',
    'cipą',
    'cipę',
    'ciul',
    'cocknose',
    'crikey',
    'cum',
    'cumbubble',
    'cunt',
    'debil',
    'dick',
    'dojeb',
    'dopieprzac',
    'dopieprzać',
    'dopierd',
    'downie',
    'dupa',
    'dupcia',
    'dupe',
    'dupeczka',
    'dupie',
    'dupy',
    'dupą',
    'dzifka',
    'dzifko',
    'dziwka',
    'dziwko',
    'fanny',
    'fannyflaps',
    'fiucie',
    'fiut',
    'fuck',
    'huj',
    'hój',
    'jebac',
    'jebak',
    'jebaka',
    'jebako',
    'jebal',
    'jebana',
    'jebane',
    'jebanej',
    'jebani',
    'jebanka',
    'jebankiem',
    'jebanko',
    'jebany',
    'jebanych',
    'jebanym',
    'jebanymi',
    'jebaną',
    'jebać',
    'jebał',
    'jebcie',
    'jebia',
    'jebiaca',
    'jebiacego',
    'jebiacej',
    'jebiacy',
    'jebie',
    'jebią',
    'jebiąca',
    'jebiącego',
    'jebiącej',
    'jebiący',
    'jebię',
    'jebliwy',
    'jebna',
    'jebnac',
    'jebnal',
    'jebnać',
    'jebnela',
    'jebnie',
    'jebnij',
    'jebną',
    'jebnąc',
    'jebnąć',
    'jebnął',
    'jebnęła',
    'jebut',
    'jizzbreath',
    'jizzcock',
    'jizzstain',
    'knobhead',
    'knobjockey',
    'koorwa',
    'korewko',
    'kurestwo',
    'kurew',
    'kurewko',
    'kurewska',
    'kurewski',
    'kurewskiej',
    'kurewsko',
    'kurewską',
    'kurewstwo',
    'kurwa',
    'kurwe',
    'kurwi',
    'kurwo',
    'kurwy',
    'kurwą',
    'kurwę',
    'kutas',
    'kórewko',
    'kórwa',
    'lesbijko',
    'matkojebca',
    'matkojebcach',
    'matkojebcami',
    'matkojebcy',
    'matkojebcą',
    'morde',
    'mordę',
    'nabarłożyć',
    'najeb',
    'nakurwi',
    'naopierdalac',
    'naopierdalal',
    'naopierdalala',
    'naopierdalać',
    'naopierdalał',
    'naopierdalała',
    'napierdalac',
    'napierdalajacy',
    'napierdalający',
    'napierdalać',
    'napierdolic',
    'napierdolić',
    'nawpierdalac',
    'nawpierdalal',
    'nawpierdalala',
    'nawpierdalać',
    'nawpierdalał',
    'nawpierdalała',
    'nonce',
    'nutsack',
    'obsrywac',
    'obsrywajacy',
    'obsrywający',
    'obsrywać',
    'odpieprzac',
    'odpieprzać',
    'odpieprzy',
    'odpieprzyl',
    'odpieprzyla',
    'odpieprzył',
    'odpieprzyła',
    'odpierdalac',
    'odpierdalajaca',
    'odpierdalajacy',
    'odpierdalająca',
    'odpierdalający',
    'odpierdalać',
    'odpierdol',
    'odpierdoli',
    'odpierdolic',
    'odpierdolil',
    'odpierdolila',
    'odpierdolić',
    'odpierdolił',
    'odpierdoliła',
    'opieprzający',
    'opierdala',
    'opierdalac',
    'opierdalajacy',
    'opierdalający',
    'opierdalać',
    'opierdol',
    'opierdola',
    'opierdoli',
    'opierdolic',
    'opierdolić',
    'opierdolą',
    'pedale',
    'picza',
    'piczka',
    'piczo',
    'pieprz',
    'pieprzniety',
    'pieprznięty',
    'pieprzony',
    'pierdel',
    'pierdlu',
    'pierdol',
    'pierdola',
    'pierdolaca',
    'pierdolacy',
    'pierdole',
    'pierdolec',
    'pierdolenie',
    'pierdoleniem',
    'pierdoleniu',
    'pierdoli',
    'pierdolic',
    'pierdolicie',
    'pierdolil',
    'pierdolila',
    'pierdolisz',
    'pierdolić',
    'pierdolił',
    'pierdoliła',
    'pierdolnac',
    'pierdolnal',
    'pierdolnela',
    'pierdolnie',
    'pierdolniety',
    'pierdolnij',
    'pierdolnik',
    'pierdolnięty',
    'pierdolny',
    'pierdolnąć',
    'pierdolnął',
    'pierdolnęła',
    'pierdolona',
    'pierdolone',
    'pierdolony',
    'pierdolą',
    'pierdoląca',
    'pierdolący',
    'pierdolę',
    'pierdołki',
    'pierdziec',
    'pierdzieć',
    'pierdzący',
    'piss',
    'pizda',
    'pizde',
    'pizdnac',
    'pizdnąć',
    'pizdu',
    'pizdzie',
    'pizdą',
    'pizdę',
    'piździe',
    'podjebac',
    'podjebać',
    'podkurwic',
    'podkurwić',
    'podpierdala',
    'podpierdalac',
    'podpierdalajacy',
    'podpierdalający',
    'podpierdalać',
    'podpierdoli',
    'podpierdolic',
    'podpierdolić',
    'pojeb',
    'pojeba',
    'pojebac',
    'pojebalo',
    'pojebami',
    'pojebancu',
    'pojebane',
    'pojebanego',
    'pojebanemu',
    'pojebani',
    'pojebany',
    'pojebanych',
    'pojebanym',
    'pojebanymi',
    'pojebać',
    'pojebańcu',
    'pojebem',
    'popierdala',
    'popierdalac',
    'popierdalać',
    'popierdolencu',
    'popierdoleni',
    'popierdoleńcu',
    'popierdoli',
    'popierdolic',
    'popierdolić',
    'popierdolone',
    'popierdolonego',
    'popierdolonemu',
    'popierdolony',
    'popierdolonym',
    'porozpierdala',
    'porozpierdalac',
    'porozpierdalać',
    'poruchac',
    'poruchać',
    'przejebac',
    'przejebane',
    'przejebać',
    'przepierdala',
    'przepierdalac',
    'przepierdalajaca',
    'przepierdalajacy',
    'przepierdalająca',
    'przepierdalający',
    'przepierdalać',
    'przepierdolic',
    'przepierdolić',
    'przyjebac',
    'przyjebal',
    'przyjebala',
    'przyjebali',
    'przyjebać',
    'przyjebał',
    'przyjebała',
    'przyjebie',
    'przypieprzac',
    'przypieprzajaca',
    'przypieprzajacy',
    'przypieprzająca',
    'przypieprzający',
    'przypieprzać',
    'przypierdala',
    'przypierdalac',
    'przypierdalajacy',
    'przypierdalający',
    'przypierdalać',
    'przypierdoli',
    'przypierdolic',
    'przypierdolić',
    'qrwa',
    'quim',
    'rozjeb',
    'rozjebac',
    'rozjebali',
    'rozjebaliście',
    'rozjebaliśmy',
    'rozjebać',
    'rozjebał',
    'rozjebała',
    'rozjebałam',
    'rozjebałaś',
    'rozjebałem',
    'rozjebałeś',
    'rozjebało',
    'rozjebały',
    'rozjebałyście',
    'rozjebałyśmy',
    'rozjebcie',
    'rozjebie',
    'rozjebiecie',
    'rozjebiemy',
    'rozjebiesz',
    'rozjebią',
    'rozjebię',
    'rozjebmy',
    'rozpierdala',
    'rozpierdalac',
    'rozpierdalać',
    'rozpierdole',
    'rozpierdoli',
    'rozpierdolic',
    'rozpierdolić',
    'rozpierducha',
    'rucha',
    'ruchacie',
    'ruchaj',
    'ruchajcie',
    'ruchajmy',
    'ruchają',
    'ruchali',
    'ruchaliście',
    'ruchaliśmy',
    'rucham',
    'ruchamy',
    'ruchasz',
    'ruchać',
    'ruchał',
    'ruchała',
    'ruchałam',
    'ruchałaś',
    'ruchałem',
    'ruchałeś',
    'ruchało',
    'ruchałom',
    'ruchałoś',
    'ruchały',
    'ruchałyście',
    'ruchałyśmy',
    'ryj',
    'scrote',
    'shag',
    'shit',
    'shitmagnet',
    'skurwic',
    'skurwiel',
    'skurwiela',
    'skurwielem',
    'skurwielu',
    'skurwić',
    'skurwysyn',
    'skurwysyna',
    'skurwysynem',
    'skurwysynow',
    'skurwysynski',
    'skurwysynstwo',
    'skurwysynu',
    'skurwysyny',
    'skurwysynów',
    'skurwysyński',
    'skurwysyństwo',
    'skutasiony',
    'spermosiorbacz',
    'spermosiorbaczem',
    'spieprza',
    'spieprzac',
    'spieprzaj',
    'spieprzaja',
    'spieprzajaca',
    'spieprzajacy',
    'spieprzajcie',
    'spieprzają',
    'spieprzająca',
    'spieprzający',
    'spieprzać',
    'spierdala',
    'spierdalac',
    'spierdalaj',
    'spierdalajacy',
    'spierdalający',
    'spierdalal',
    'spierdalala',
    'spierdalalcie',
    'spierdalać',
    'spierdalał',
    'spierdalała',
    'spierdola',
    'spierdolencu',
    'spierdoleńcu',
    'spierdoli',
    'spierdolic',
    'spierdolić',
    'spierdoliła',
    'spierdoliło',
    'spierdolą',
    'srac',
    'sraj',
    'srajac',
    'srajacy',
    'srając',
    'srający',
    'srać',
    'sukinsyn',
    'sukinsynom',
    'sukinsynow',
    'sukinsynowi',
    'sukinsyny',
    'sukinsynów',
    'szmata',
    'szmato',
    'todger',
    'tosspot',
    'twat',
    'udupić',
    'ujebac',
    'ujebal',
    'ujebala',
    'ujebana',
    'ujebany',
    'ujebać',
    'ujebał',
    'ujebała',
    'ujebie',
    'upierdala',
    'upierdalac',
    'upierdalać',
    'upierdol',
    'upierdola',
    'upierdoleni',
    'upierdoli',
    'upierdolic',
    'upierdolić',
    'upierdolą',
    'wanker',
    'wankface',
    'wazzock',
    'wjebac',
    'wjebać',
    'wjebia',
    'wjebie',
    'wjebiecie',
    'wjebiemy',
    'wjebią',
    'wkurwi',
    'wkurwia',
    'wkurwiac',
    'wkurwiacie',
    'wkurwiajaca',
    'wkurwiajacy',
    'wkurwiają',
    'wkurwiająca',
    'wkurwiający',
    'wkurwial',
    'wkurwiali',
    'wkurwiać',
    'wkurwiał',
    'wkurwic',
    'wkurwicie',
    'wkurwimy',
    'wkurwią',
    'wkurwić',
    'wpierdalac',
    'wpierdalajacy',
    'wpierdalający',
    'wpierdalać',
    'wpierdol',
    'wpierdolic',
    'wpierdolić',
    'wpizdu',
    'wyjebac',
    'wyjebali',
    'wyjebany',
    'wyjebać',
    'wyjebał',
    'wyjebała',
    'wyjebały',
    'wyjebia',
    'wyjebie',
    'wyjebiecie',
    'wyjebiemy',
    'wyjebiesz',
    'wyjebią',
    'wykurwic',
    'wykurwić',
    'wykurwiście',
    'wypieprza',
    'wypieprzac',
    'wypieprzal',
    'wypieprzala',
    'wypieprzać',
    'wypieprzał',
    'wypieprzała',
    'wypieprzy',
    'wypieprzyl',
    'wypieprzyla',
    'wypieprzył',
    'wypieprzyła',
    'wypierdal',
    'wypierdala',
    'wypierdalac',
    'wypierdalaj',
    'wypierdalal',
    'wypierdalala',
    'wypierdalać',
    'wypierdalał',
    'wypierdalała',
    'wypierdola',
    'wypierdoli',
    'wypierdolic',
    'wypierdolicie',
    'wypierdolil',
    'wypierdolila',
    'wypierdolili',
    'wypierdolimy',
    'wypierdolić',
    'wypierdolił',
    'wypierdoliła',
    'wypierdolą',
    'wypiździały',
    'zajebac',
    'zajebali',
    'zajebana',
    'zajebane',
    'zajebani',
    'zajebany',
    'zajebanych',
    'zajebanym',
    'zajebanymi',
    'zajebać',
    'zajebała',
    'zajebia',
    'zajebial',
    'zajebiala',
    'zajebiał',
    'zajebie',
    'zajebiscie',
    'zajebista',
    'zajebiste',
    'zajebisty',
    'zajebistych',
    'zajebistym',
    'zajebistymi',
    'zajebią',
    'zajebiście',
    'zapieprza',
    'zapieprzy',
    'zapieprzyc',
    'zapieprzycie',
    'zapieprzyl',
    'zapieprzyla',
    'zapieprzymy',
    'zapieprzysz',
    'zapieprzyć',
    'zapieprzył',
    'zapieprzyła',
    'zapieprzą',
    'zapierdala',
    'zapierdalac',
    'zapierdalaj',
    'zapierdalaja',
    'zapierdalajacy',
    'zapierdalajcie',
    'zapierdalający',
    'zapierdalala',
    'zapierdalali',
    'zapierdalać',
    'zapierdalał',
    'zapierdalała',
    'zapierdola',
    'zapierdoli',
    'zapierdolic',
    'zapierdolil',
    'zapierdolila',
    'zapierdolić',
    'zapierdolił',
    'zapierdoliła',
    'zapierdolą',
    'zapierniczający',
    'zapierniczać',
    'zasranym',
    'zasrać',
    'zasrywający',
    'zasrywać',
    'zesrywający',
    'zesrywać',
    'zjebac',
    'zjebal',
    'zjebala',
    'zjebali',
    'zjebana',
    'zjebancu',
    'zjebane',
    'zjebać',
    'zjebał',
    'zjebała',
    'zjebańcu',
    'zjebią',
    'zjeby',
    'śmierdziel',
];

export default forbiddenPhrases;
