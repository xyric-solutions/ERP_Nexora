/**
 * Country reference data shared across Nexora features: ISO 3166-1 alpha-2
 * code, English short name and international calling code (ITU-T E.164).
 *
 * Reference data only; it is not a fixture and holds no business records.
 * Flags are derived from the ISO code as Unicode regional-indicator emoji.
 * Some desktop platforms (notably Windows) render these as the two-letter
 * code instead of a picture, which is still unambiguous.
 */

export interface CountryInfo {
  /** ISO 3166-1 alpha-2 code, e.g. "PK". */
  code: string;
  name: string;
  /** Calling code digits without "+", e.g. "92". */
  dial: string;
}

const RAW: readonly (readonly [code: string, name: string, dial: string])[] = [
  ["AF", "Afghanistan", "93"], ["AX", "Åland Islands", "358"], ["AL", "Albania", "355"], ["DZ", "Algeria", "213"],
  ["AS", "American Samoa", "1"], ["AD", "Andorra", "376"], ["AO", "Angola", "244"], ["AI", "Anguilla", "1"],
  ["AG", "Antigua and Barbuda", "1"], ["AR", "Argentina", "54"], ["AM", "Armenia", "374"], ["AW", "Aruba", "297"],
  ["AU", "Australia", "61"], ["AT", "Austria", "43"], ["AZ", "Azerbaijan", "994"], ["BS", "Bahamas", "1"],
  ["BH", "Bahrain", "973"], ["BD", "Bangladesh", "880"], ["BB", "Barbados", "1"], ["BY", "Belarus", "375"],
  ["BE", "Belgium", "32"], ["BZ", "Belize", "501"], ["BJ", "Benin", "229"], ["BM", "Bermuda", "1"],
  ["BT", "Bhutan", "975"], ["BO", "Bolivia", "591"], ["BQ", "Caribbean Netherlands", "599"], ["BA", "Bosnia and Herzegovina", "387"],
  ["BW", "Botswana", "267"], ["BR", "Brazil", "55"], ["IO", "British Indian Ocean Territory", "246"], ["VG", "British Virgin Islands", "1"],
  ["BN", "Brunei", "673"], ["BG", "Bulgaria", "359"], ["BF", "Burkina Faso", "226"], ["BI", "Burundi", "257"],
  ["CV", "Cabo Verde", "238"], ["KH", "Cambodia", "855"], ["CM", "Cameroon", "237"], ["CA", "Canada", "1"],
  ["KY", "Cayman Islands", "1"], ["CF", "Central African Republic", "236"], ["TD", "Chad", "235"], ["CL", "Chile", "56"],
  ["CN", "China", "86"], ["CX", "Christmas Island", "61"], ["CC", "Cocos (Keeling) Islands", "61"], ["CO", "Colombia", "57"],
  ["KM", "Comoros", "269"], ["CG", "Congo", "242"], ["CD", "Congo (DRC)", "243"], ["CK", "Cook Islands", "682"],
  ["CR", "Costa Rica", "506"], ["CI", "Côte d’Ivoire", "225"], ["HR", "Croatia", "385"], ["CU", "Cuba", "53"],
  ["CW", "Curaçao", "599"], ["CY", "Cyprus", "357"], ["CZ", "Czechia", "420"], ["DK", "Denmark", "45"],
  ["DJ", "Djibouti", "253"], ["DM", "Dominica", "1"], ["DO", "Dominican Republic", "1"], ["EC", "Ecuador", "593"],
  ["EG", "Egypt", "20"], ["SV", "El Salvador", "503"], ["GQ", "Equatorial Guinea", "240"], ["ER", "Eritrea", "291"],
  ["EE", "Estonia", "372"], ["SZ", "Eswatini", "268"], ["ET", "Ethiopia", "251"], ["FK", "Falkland Islands", "500"],
  ["FO", "Faroe Islands", "298"], ["FJ", "Fiji", "679"], ["FI", "Finland", "358"], ["FR", "France", "33"],
  ["GF", "French Guiana", "594"], ["PF", "French Polynesia", "689"], ["GA", "Gabon", "241"], ["GM", "Gambia", "220"],
  ["GE", "Georgia", "995"], ["DE", "Germany", "49"], ["GH", "Ghana", "233"], ["GI", "Gibraltar", "350"],
  ["GR", "Greece", "30"], ["GL", "Greenland", "299"], ["GD", "Grenada", "1"], ["GP", "Guadeloupe", "590"],
  ["GU", "Guam", "1"], ["GT", "Guatemala", "502"], ["GG", "Guernsey", "44"], ["GN", "Guinea", "224"],
  ["GW", "Guinea-Bissau", "245"], ["GY", "Guyana", "592"], ["HT", "Haiti", "509"], ["HN", "Honduras", "504"],
  ["HK", "Hong Kong", "852"], ["HU", "Hungary", "36"], ["IS", "Iceland", "354"], ["IN", "India", "91"],
  ["ID", "Indonesia", "62"], ["IR", "Iran", "98"], ["IQ", "Iraq", "964"], ["IE", "Ireland", "353"],
  ["IM", "Isle of Man", "44"], ["IL", "Israel", "972"], ["IT", "Italy", "39"], ["JM", "Jamaica", "1"],
  ["JP", "Japan", "81"], ["JE", "Jersey", "44"], ["JO", "Jordan", "962"], ["KZ", "Kazakhstan", "7"],
  ["KE", "Kenya", "254"], ["KI", "Kiribati", "686"], ["XK", "Kosovo", "383"], ["KW", "Kuwait", "965"],
  ["KG", "Kyrgyzstan", "996"], ["LA", "Laos", "856"], ["LV", "Latvia", "371"], ["LB", "Lebanon", "961"],
  ["LS", "Lesotho", "266"], ["LR", "Liberia", "231"], ["LY", "Libya", "218"], ["LI", "Liechtenstein", "423"],
  ["LT", "Lithuania", "370"], ["LU", "Luxembourg", "352"], ["MO", "Macao", "853"], ["MG", "Madagascar", "261"],
  ["MW", "Malawi", "265"], ["MY", "Malaysia", "60"], ["MV", "Maldives", "960"], ["ML", "Mali", "223"],
  ["MT", "Malta", "356"], ["MH", "Marshall Islands", "692"], ["MQ", "Martinique", "596"], ["MR", "Mauritania", "222"],
  ["MU", "Mauritius", "230"], ["YT", "Mayotte", "262"], ["MX", "Mexico", "52"], ["FM", "Micronesia", "691"],
  ["MD", "Moldova", "373"], ["MC", "Monaco", "377"], ["MN", "Mongolia", "976"], ["ME", "Montenegro", "382"],
  ["MS", "Montserrat", "1"], ["MA", "Morocco", "212"], ["MZ", "Mozambique", "258"], ["MM", "Myanmar", "95"],
  ["NA", "Namibia", "264"], ["NR", "Nauru", "674"], ["NP", "Nepal", "977"], ["NL", "Netherlands", "31"],
  ["NC", "New Caledonia", "687"], ["NZ", "New Zealand", "64"], ["NI", "Nicaragua", "505"], ["NE", "Niger", "227"],
  ["NG", "Nigeria", "234"], ["NU", "Niue", "683"], ["NF", "Norfolk Island", "672"], ["KP", "North Korea", "850"],
  ["MK", "North Macedonia", "389"], ["MP", "Northern Mariana Islands", "1"], ["NO", "Norway", "47"], ["OM", "Oman", "968"],
  ["PK", "Pakistan", "92"], ["PW", "Palau", "680"], ["PS", "Palestine", "970"], ["PA", "Panama", "507"],
  ["PG", "Papua New Guinea", "675"], ["PY", "Paraguay", "595"], ["PE", "Peru", "51"], ["PH", "Philippines", "63"],
  ["PL", "Poland", "48"], ["PT", "Portugal", "351"], ["PR", "Puerto Rico", "1"], ["QA", "Qatar", "974"],
  ["RE", "Réunion", "262"], ["RO", "Romania", "40"], ["RU", "Russia", "7"], ["RW", "Rwanda", "250"],
  ["BL", "Saint Barthélemy", "590"], ["SH", "Saint Helena", "290"], ["KN", "Saint Kitts and Nevis", "1"], ["LC", "Saint Lucia", "1"],
  ["MF", "Saint Martin", "590"], ["PM", "Saint Pierre and Miquelon", "508"], ["VC", "Saint Vincent and the Grenadines", "1"], ["WS", "Samoa", "685"],
  ["SM", "San Marino", "378"], ["ST", "São Tomé and Príncipe", "239"], ["SA", "Saudi Arabia", "966"], ["SN", "Senegal", "221"],
  ["RS", "Serbia", "381"], ["SC", "Seychelles", "248"], ["SL", "Sierra Leone", "232"], ["SG", "Singapore", "65"],
  ["SX", "Sint Maarten", "1"], ["SK", "Slovakia", "421"], ["SI", "Slovenia", "386"], ["SB", "Solomon Islands", "677"],
  ["SO", "Somalia", "252"], ["ZA", "South Africa", "27"], ["KR", "South Korea", "82"], ["SS", "South Sudan", "211"],
  ["ES", "Spain", "34"], ["LK", "Sri Lanka", "94"], ["SD", "Sudan", "249"], ["SR", "Suriname", "597"],
  ["SJ", "Svalbard and Jan Mayen", "47"], ["SE", "Sweden", "46"], ["CH", "Switzerland", "41"], ["SY", "Syria", "963"],
  ["TW", "Taiwan", "886"], ["TJ", "Tajikistan", "992"], ["TZ", "Tanzania", "255"], ["TH", "Thailand", "66"],
  ["TL", "Timor-Leste", "670"], ["TG", "Togo", "228"], ["TK", "Tokelau", "690"], ["TO", "Tonga", "676"],
  ["TT", "Trinidad and Tobago", "1"], ["TN", "Tunisia", "216"], ["TR", "Türkiye", "90"], ["TM", "Turkmenistan", "993"],
  ["TC", "Turks and Caicos Islands", "1"], ["TV", "Tuvalu", "688"], ["UG", "Uganda", "256"], ["UA", "Ukraine", "380"],
  ["AE", "United Arab Emirates", "971"], ["GB", "United Kingdom", "44"], ["US", "United States", "1"], ["UY", "Uruguay", "598"],
  ["VI", "U.S. Virgin Islands", "1"], ["UZ", "Uzbekistan", "998"], ["VU", "Vanuatu", "678"], ["VA", "Vatican City", "39"],
  ["VE", "Venezuela", "58"], ["VN", "Vietnam", "84"], ["WF", "Wallis and Futuna", "681"], ["EH", "Western Sahara", "212"],
  ["YE", "Yemen", "967"], ["ZM", "Zambia", "260"], ["ZW", "Zimbabwe", "263"],
];

/** Every country, sorted by name. */
export const COUNTRIES: readonly CountryInfo[] = RAW.map(([code, name, dial]) => ({ code, name, dial })).sort((a, b) =>
  a.name.localeCompare(b.name),
);

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function findCountry(code: string | undefined): CountryInfo | undefined {
  return code ? BY_CODE.get(code.toUpperCase()) : undefined;
}

export function countryName(code: string | undefined): string {
  return findCountry(code)?.name ?? code ?? "";
}

/** Regional-indicator flag emoji for an ISO alpha-2 code. */
export function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/**
 * Active ISO 4217 currencies (circulating national and regional currencies;
 * fund codes, precious metals and withdrawn codes are excluded), sorted by
 * code. Offered wherever a customer, bank account or sales/receipt document
 * chooses a currency.
 */
export const CURRENCIES: readonly (readonly [code: string, name: string])[] = [
  ["AED", "UAE Dirham"], ["AFN", "Afghan Afghani"], ["ALL", "Albanian Lek"], ["AMD", "Armenian Dram"],
  ["AOA", "Angolan Kwanza"], ["ARS", "Argentine Peso"], ["AUD", "Australian Dollar"], ["AWG", "Aruban Florin"],
  ["AZN", "Azerbaijani Manat"], ["BAM", "Bosnia-Herzegovina Convertible Mark"], ["BBD", "Barbadian Dollar"],
  ["BDT", "Bangladeshi Taka"], ["BHD", "Bahraini Dinar"], ["BIF", "Burundian Franc"], ["BMD", "Bermudian Dollar"],
  ["BND", "Brunei Dollar"], ["BOB", "Bolivian Boliviano"], ["BRL", "Brazilian Real"], ["BSD", "Bahamian Dollar"],
  ["BTN", "Bhutanese Ngultrum"], ["BWP", "Botswana Pula"], ["BYN", "Belarusian Ruble"], ["BZD", "Belize Dollar"],
  ["CAD", "Canadian Dollar"], ["CDF", "Congolese Franc"], ["CHF", "Swiss Franc"], ["CLP", "Chilean Peso"],
  ["CNY", "Chinese Yuan"], ["COP", "Colombian Peso"], ["CRC", "Costa Rican Colón"], ["CUP", "Cuban Peso"],
  ["CVE", "Cape Verdean Escudo"], ["CZK", "Czech Koruna"], ["DJF", "Djiboutian Franc"], ["DKK", "Danish Krone"],
  ["DOP", "Dominican Peso"], ["DZD", "Algerian Dinar"], ["EGP", "Egyptian Pound"], ["ERN", "Eritrean Nakfa"],
  ["ETB", "Ethiopian Birr"], ["EUR", "Euro"], ["FJD", "Fijian Dollar"], ["FKP", "Falkland Islands Pound"],
  ["GBP", "Pound Sterling"], ["GEL", "Georgian Lari"], ["GHS", "Ghanaian Cedi"], ["GIP", "Gibraltar Pound"],
  ["GMD", "Gambian Dalasi"], ["GNF", "Guinean Franc"], ["GTQ", "Guatemalan Quetzal"], ["GYD", "Guyanese Dollar"],
  ["HKD", "Hong Kong Dollar"], ["HNL", "Honduran Lempira"], ["HTG", "Haitian Gourde"], ["HUF", "Hungarian Forint"],
  ["IDR", "Indonesian Rupiah"], ["ILS", "Israeli New Shekel"], ["INR", "Indian Rupee"], ["IQD", "Iraqi Dinar"],
  ["IRR", "Iranian Rial"], ["ISK", "Icelandic Króna"], ["JMD", "Jamaican Dollar"], ["JOD", "Jordanian Dinar"],
  ["JPY", "Japanese Yen"], ["KES", "Kenyan Shilling"], ["KGS", "Kyrgyzstani Som"], ["KHR", "Cambodian Riel"],
  ["KMF", "Comorian Franc"], ["KPW", "North Korean Won"], ["KRW", "South Korean Won"], ["KWD", "Kuwaiti Dinar"],
  ["KYD", "Cayman Islands Dollar"], ["KZT", "Kazakhstani Tenge"], ["LAK", "Lao Kip"], ["LBP", "Lebanese Pound"],
  ["LKR", "Sri Lankan Rupee"], ["LRD", "Liberian Dollar"], ["LSL", "Lesotho Loti"], ["LYD", "Libyan Dinar"],
  ["MAD", "Moroccan Dirham"], ["MDL", "Moldovan Leu"], ["MGA", "Malagasy Ariary"], ["MKD", "Macedonian Denar"],
  ["MMK", "Myanmar Kyat"], ["MNT", "Mongolian Tögrög"], ["MOP", "Macanese Pataca"], ["MRU", "Mauritanian Ouguiya"],
  ["MUR", "Mauritian Rupee"], ["MVR", "Maldivian Rufiyaa"], ["MWK", "Malawian Kwacha"], ["MXN", "Mexican Peso"],
  ["MYR", "Malaysian Ringgit"], ["MZN", "Mozambican Metical"], ["NAD", "Namibian Dollar"], ["NGN", "Nigerian Naira"],
  ["NIO", "Nicaraguan Córdoba"], ["NOK", "Norwegian Krone"], ["NPR", "Nepalese Rupee"], ["NZD", "New Zealand Dollar"],
  ["OMR", "Omani Rial"], ["PAB", "Panamanian Balboa"], ["PEN", "Peruvian Sol"], ["PGK", "Papua New Guinean Kina"],
  ["PHP", "Philippine Peso"], ["PKR", "Pakistani Rupee"], ["PLN", "Polish Złoty"], ["PYG", "Paraguayan Guaraní"],
  ["QAR", "Qatari Riyal"], ["RON", "Romanian Leu"], ["RSD", "Serbian Dinar"], ["RUB", "Russian Ruble"],
  ["RWF", "Rwandan Franc"], ["SAR", "Saudi Riyal"], ["SBD", "Solomon Islands Dollar"], ["SCR", "Seychellois Rupee"],
  ["SDG", "Sudanese Pound"], ["SEK", "Swedish Krona"], ["SGD", "Singapore Dollar"], ["SHP", "Saint Helena Pound"],
  ["SLE", "Sierra Leonean Leone"], ["SOS", "Somali Shilling"], ["SRD", "Surinamese Dollar"], ["SSP", "South Sudanese Pound"],
  ["STN", "São Tomé and Príncipe Dobra"], ["SVC", "Salvadoran Colón"], ["SYP", "Syrian Pound"], ["SZL", "Swazi Lilangeni"],
  ["THB", "Thai Baht"], ["TJS", "Tajikistani Somoni"], ["TMT", "Turkmenistani Manat"], ["TND", "Tunisian Dinar"],
  ["TOP", "Tongan Paʻanga"], ["TRY", "Turkish Lira"], ["TTD", "Trinidad and Tobago Dollar"], ["TWD", "New Taiwan Dollar"],
  ["TZS", "Tanzanian Shilling"], ["UAH", "Ukrainian Hryvnia"], ["UGX", "Ugandan Shilling"], ["USD", "US Dollar"],
  ["UYU", "Uruguayan Peso"], ["UZS", "Uzbekistani Som"], ["VES", "Venezuelan Bolívar"], ["VND", "Vietnamese Đồng"],
  ["VUV", "Vanuatu Vatu"], ["WST", "Samoan Tālā"], ["XAF", "Central African CFA Franc"], ["XCD", "East Caribbean Dollar"],
  ["XCG", "Caribbean Guilder"], ["XOF", "West African CFA Franc"], ["XPF", "CFP Franc"], ["YER", "Yemeni Rial"],
  ["ZAR", "South African Rand"], ["ZMW", "Zambian Kwacha"], ["ZWG", "Zimbabwe Gold"],
];

/** ISO 4217 minor units that differ from the usual two decimal places. */
const MINOR_UNITS: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

/** Decimal places used for amounts in a currency (ISO 4217 minor unit). */
export function currencyDigits(code: string | undefined): number {
  return MINOR_UNITS[code ?? ""] ?? 2;
}

export function currencyName(code: string | undefined): string {
  return CURRENCIES.find(([item]) => item === code)?.[1] ?? code ?? "";
}

/** "USD · US Dollar" */
export function currencyLabel(code: string | undefined): string {
  const name = currencyName(code);
  return name && name !== code ? `${code} · ${name}` : (code ?? "");
}
