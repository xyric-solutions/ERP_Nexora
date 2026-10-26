-- Company-scoped functional currency, ISO country/currency mappings and
-- effective-dated company-rate ownership. Existing tenant rates remain valid
-- legacy evidence and are not rewritten or assigned to an arbitrary company.

CREATE TABLE country_currency_catalog (
    country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    country_name text NOT NULL CHECK (length(btrim(country_name)) BETWEEN 1 AND 120),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    currency_name text NOT NULL CHECK (length(btrim(currency_name)) BETWEEN 1 AND 100),
    currency_symbol text CHECK (currency_symbol IS NULL OR length(currency_symbol) BETWEEN 1 AND 16),
    decimal_places smallint NOT NULL CHECK (decimal_places BETWEEN 0 AND 8),
    is_primary boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
    source_version text NOT NULL CHECK (length(btrim(source_version)) BETWEEN 1 AND 64),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (country_code,currency_code)
);

-- Generated from the installed invariant .NET region catalog and pinned by
-- source_version. Tenant users cannot mutate these reference identities.
INSERT INTO country_currency_catalog(country_code,country_name,currency_code,currency_name,currency_symbol,decimal_places,is_primary,status,source_version) VALUES
 ('AD','Andorra','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('AE','United Arab Emirates','AED','United Arab Emirates Dirham','د.إ.‏',2,true,'active','dotnet-region-2026-10-26'),
 ('AF','Afghanistan','AFN','Afghan Afghani','؋',0,true,'active','dotnet-region-2026-10-26'),
 ('AG','Antigua & Barbuda','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('AI','Anguilla','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('AL','Albania','ALL','Albanian Lek','Lekë',0,true,'active','dotnet-region-2026-10-26'),
 ('AM','Armenia','AMD','Armenian Dram','֏',2,true,'active','dotnet-region-2026-10-26'),
 ('AO','Angola','AOA','Angolan Kwanza','Kz',2,true,'active','dotnet-region-2026-10-26'),
 ('AR','Argentina','ARS','Argentine Peso','$',2,true,'active','dotnet-region-2026-10-26'),
 ('AS','American Samoa','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('AT','Austria','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('AU','Australia','AUD','Australian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('AW','Aruba','AWG','Aruban Florin','Afl.',2,true,'active','dotnet-region-2026-10-26'),
 ('AX','Åland Islands','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('AZ','Azerbaijan','AZN','Azerbaijani Manat','₼',2,true,'active','dotnet-region-2026-10-26'),
 ('BA','Bosnia & Herzegovina','BAM','Bosnia-Herzegovina Convertible Mark','KM',2,true,'active','dotnet-region-2026-10-26'),
 ('BB','Barbados','BBD','Barbadian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('BD','Bangladesh','BDT','Bangladeshi Taka','৳',2,true,'active','dotnet-region-2026-10-26'),
 ('BE','Belgium','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('BF','Burkina Faso','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('BG','Bulgaria','BGN','Bulgarian Lev','лв.',2,true,'active','dotnet-region-2026-10-26'),
 ('BH','Bahrain','BHD','Bahraini Dinar','د.ب.‏',3,true,'active','dotnet-region-2026-10-26'),
 ('BI','Burundi','BIF','Burundian Franc','FBu',0,true,'active','dotnet-region-2026-10-26'),
 ('BJ','Benin','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('BL','St. Barthélemy','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('BM','Bermuda','BMD','Bermudan Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('BN','Brunei','BND','Brunei Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('BO','Bolivia','BOB','Bolivian Boliviano','Bs.',2,true,'active','dotnet-region-2026-10-26'),
 ('BQ','Bonaire, Sint Eustatius and Saba','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('BR','Brazil','BRL','Brazilian Real','R$',2,true,'active','dotnet-region-2026-10-26'),
 ('BS','Bahamas','BSD','Bahamian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('BT','Bhutan','BTN','Bhutanese Ngultrum','Nu.',2,true,'active','dotnet-region-2026-10-26'),
 ('BW','Botswana','BWP','Botswanan Pula','P',2,true,'active','dotnet-region-2026-10-26'),
 ('BY','Belarus','BYN','Belarusian Ruble','Br',2,true,'active','dotnet-region-2026-10-26'),
 ('BZ','Belize','BZD','Belize Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('CA','Canada','CAD','Canadian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('CC','Cocos (Keeling) Islands','AUD','Australian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('CD','Congo (DRC)','CDF','Congolese Franc','FC',2,true,'active','dotnet-region-2026-10-26'),
 ('CF','Central African Republic','XAF','Central African CFA Franc','FCFA',0,true,'active','dotnet-region-2026-10-26'),
 ('CG','Congo','XAF','Central African CFA Franc','FCFA',0,true,'active','dotnet-region-2026-10-26'),
 ('CH','Switzerland','CHF','Swiss Franc','CHF',2,true,'active','dotnet-region-2026-10-26'),
 ('CI','Côte d’Ivoire','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('CK','Cook Islands','NZD','New Zealand Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('CL','Chile','CLP','Chilean Peso','$',0,true,'active','dotnet-region-2026-10-26'),
 ('CM','Cameroon','XAF','Central African CFA Franc','FCFA',0,true,'active','dotnet-region-2026-10-26'),
 ('CN','China','CNY','Chinese Yuan','¥',2,true,'active','dotnet-region-2026-10-26'),
 ('CO','Colombia','COP','Colombian Peso','$',2,true,'active','dotnet-region-2026-10-26'),
 ('CR','Costa Rica','CRC','Costa Rican Colón','₡',2,true,'active','dotnet-region-2026-10-26'),
 ('CU','Cuba','CUP','Cuban Peso','$',2,true,'active','dotnet-region-2026-10-26'),
 ('CV','Cabo Verde','CVE','Cape Verdean Escudo','​',2,true,'active','dotnet-region-2026-10-26'),
 ('CW','Curaçao','ANG','Netherlands Antillean Guilder','NAf.',2,true,'active','dotnet-region-2026-10-26'),
 ('CX','Christmas Island','AUD','Australian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('CY','Cyprus','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('CZ','Czechia','CZK','Czech Koruna','Kč',2,true,'active','dotnet-region-2026-10-26'),
 ('DE','Germany','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('DJ','Djibouti','DJF','Djiboutian Franc','Fdj',0,true,'active','dotnet-region-2026-10-26'),
 ('DK','Denmark','DKK','Danish Krone','kr.',2,true,'active','dotnet-region-2026-10-26'),
 ('DM','Dominica','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('DO','Dominican Republic','DOP','Dominican Peso','$',2,true,'active','dotnet-region-2026-10-26'),
 ('DZ','Algeria','DZD','Algerian Dinar','DA',2,true,'active','dotnet-region-2026-10-26'),
 ('EC','Ecuador','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('EE','Estonia','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('EG','Egypt','EGP','Egyptian Pound','ج.م.‏',2,true,'active','dotnet-region-2026-10-26'),
 ('ER','Eritrea','ERN','Eritrean Nakfa','Nfk',2,true,'active','dotnet-region-2026-10-26'),
 ('ES','Spain','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('ET','Ethiopia','ETB','Ethiopian Birr','Br',2,true,'active','dotnet-region-2026-10-26'),
 ('FI','Finland','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('FJ','Fiji','FJD','Fijian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('FK','Falkland Islands','FKP','Falkland Islands Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('FM','Micronesia','USD','US Dollar','US$',2,true,'active','dotnet-region-2026-10-26'),
 ('FO','Faroe Islands','DKK','Danish Krone','kr',2,true,'active','dotnet-region-2026-10-26'),
 ('FR','France','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('GA','Gabon','XAF','Central African CFA Franc','FCFA',0,true,'active','dotnet-region-2026-10-26'),
 ('GB','United Kingdom','GBP','British Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('GD','Grenada','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('GE','Georgia','GEL','Georgian Lari','₾',2,true,'active','dotnet-region-2026-10-26'),
 ('GF','French Guiana','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('GG','Guernsey','GBP','British Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('GH','Ghana','GHS','Ghanaian Cedi','GH₵',2,true,'active','dotnet-region-2026-10-26'),
 ('GI','Gibraltar','GIP','Gibraltar Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('GL','Greenland','DKK','Danish Krone','kr.',2,true,'active','dotnet-region-2026-10-26'),
 ('GM','Gambia','GMD','Gambian Dalasi','D',2,true,'active','dotnet-region-2026-10-26'),
 ('GN','Guinea','GNF','Guinean Franc','FG',0,true,'active','dotnet-region-2026-10-26'),
 ('GP','Guadeloupe','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('GQ','Equatorial Guinea','XAF','Central African CFA Franc','FCFA',0,true,'active','dotnet-region-2026-10-26'),
 ('GR','Greece','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('GT','Guatemala','GTQ','Guatemalan Quetzal','Q',2,true,'active','dotnet-region-2026-10-26'),
 ('GU','Guam','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('GW','Guinea-Bissau','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('GY','Guyana','GYD','Guyanaese Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('HK','Hong Kong SAR','HKD','Hong Kong Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('HN','Honduras','HNL','Honduran Lempira','L',2,true,'active','dotnet-region-2026-10-26'),
 ('HR','Croatia','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('HT','Haiti','HTG','Haitian Gourde','G',2,true,'active','dotnet-region-2026-10-26'),
 ('HU','Hungary','HUF','Hungarian Forint','Ft',2,true,'active','dotnet-region-2026-10-26'),
 ('ID','Indonesia','IDR','Indonesian Rupiah','Rp',2,true,'active','dotnet-region-2026-10-26'),
 ('IE','Ireland','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('IL','Israel','ILS','Israeli New Shekel','₪',2,true,'active','dotnet-region-2026-10-26'),
 ('IM','Isle of Man','GBP','British Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('IN','India','INR','Indian Rupee','₹',2,true,'active','dotnet-region-2026-10-26'),
 ('IO','British Indian Ocean Territory','USD','US Dollar','US$',2,true,'active','dotnet-region-2026-10-26'),
 ('IQ','Iraq','IQD','Iraqi Dinar','د.ع.‏',0,true,'active','dotnet-region-2026-10-26'),
 ('IR','Iran','IRR','Iranian Rial','IRR',0,true,'active','dotnet-region-2026-10-26'),
 ('IS','Iceland','ISK','Icelandic Króna','kr.',0,true,'active','dotnet-region-2026-10-26'),
 ('IT','Italy','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('JE','Jersey','GBP','British Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('JM','Jamaica','JMD','Jamaican Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('JO','Jordan','JOD','Jordanian Dinar','د.ا.‏',3,true,'active','dotnet-region-2026-10-26'),
 ('JP','Japan','JPY','Japanese Yen','¥',0,true,'active','dotnet-region-2026-10-26'),
 ('KE','Kenya','KES','Kenyan Shilling','Ksh',2,true,'active','dotnet-region-2026-10-26'),
 ('KG','Kyrgyzstan','KGS','Kyrgystani Som','сом',2,true,'active','dotnet-region-2026-10-26'),
 ('KH','Cambodia','KHR','Cambodian Riel','៛',2,true,'active','dotnet-region-2026-10-26'),
 ('KI','Kiribati','AUD','Australian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('KM','Comoros','KMF','Comorian Franc','CF',0,true,'active','dotnet-region-2026-10-26'),
 ('KN','St. Kitts & Nevis','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('KP','North Korea','KPW','North Korean Won','₩',0,true,'active','dotnet-region-2026-10-26'),
 ('KR','Korea','KRW','South Korean Won','₩',0,true,'active','dotnet-region-2026-10-26'),
 ('KW','Kuwait','KWD','Kuwaiti Dinar','د.ك.‏',3,true,'active','dotnet-region-2026-10-26'),
 ('KY','Cayman Islands','KYD','Cayman Islands Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('KZ','Kazakhstan','KZT','Kazakhstani Tenge','₸',2,true,'active','dotnet-region-2026-10-26'),
 ('LA','Laos','LAK','Laotian Kip','₭',0,true,'active','dotnet-region-2026-10-26'),
 ('LB','Lebanon','LBP','Lebanese Pound','ل.ل.‏',2,true,'active','dotnet-region-2026-10-26'),
 ('LC','St. Lucia','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('LI','Liechtenstein','CHF','Swiss Franc','CHF',2,true,'active','dotnet-region-2026-10-26'),
 ('LK','Sri Lanka','LKR','Sri Lankan Rupee','Rs.',2,true,'active','dotnet-region-2026-10-26'),
 ('LR','Liberia','LRD','Liberian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('LS','Lesotho','ZAR','South African Rand','R',2,true,'active','dotnet-region-2026-10-26'),
 ('LT','Lithuania','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('LU','Luxembourg','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('LV','Latvia','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('LY','Libya','LYD','Libyan Dinar','د.ل.‏',3,true,'active','dotnet-region-2026-10-26'),
 ('MA','Morocco','MAD','Moroccan Dirham','د.م.‏',2,true,'active','dotnet-region-2026-10-26'),
 ('MC','Monaco','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('MD','Moldova','MDL','Moldovan Leu','L',2,true,'active','dotnet-region-2026-10-26'),
 ('ME','Montenegro','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('MF','St. Martin','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('MG','Madagascar','MGA','Malagasy Ariary','Ar',0,true,'active','dotnet-region-2026-10-26'),
 ('MH','Marshall Islands','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('MK','North Macedonia','MKD','Macedonian Denar','den',2,true,'active','dotnet-region-2026-10-26'),
 ('ML','Mali','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('MM','Myanmar','MMK','Myanmar Kyat','K',0,true,'active','dotnet-region-2026-10-26'),
 ('MN','Mongolia','MNT','Mongolian Tugrik','₮',2,true,'active','dotnet-region-2026-10-26'),
 ('MO','Macao SAR','MOP','Macanese Pataca','MOP$',2,true,'active','dotnet-region-2026-10-26'),
 ('MP','Northern Mariana Islands','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('MQ','Martinique','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('MR','Mauritania','MRU','Mauritanian Ouguiya','UM',2,true,'active','dotnet-region-2026-10-26'),
 ('MS','Montserrat','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('MT','Malta','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('MU','Mauritius','MUR','Mauritian Rupee','Rs',2,true,'active','dotnet-region-2026-10-26'),
 ('MV','Maldives','MVR','Maldivian Rufiyaa','ރ.',2,true,'active','dotnet-region-2026-10-26'),
 ('MW','Malawi','MWK','Malawian Kwacha','MK',2,true,'active','dotnet-region-2026-10-26'),
 ('MX','Mexico','MXN','Mexican Peso','$',2,true,'active','dotnet-region-2026-10-26'),
 ('MY','Malaysia','MYR','Malaysian Ringgit','RM',2,true,'active','dotnet-region-2026-10-26'),
 ('MZ','Mozambique','MZN','Mozambican Metical','MTn',2,true,'active','dotnet-region-2026-10-26'),
 ('NA','Namibia','NAD','Namibian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('NC','New Caledonia','XPF','CFP Franc','FCFP',0,true,'active','dotnet-region-2026-10-26'),
 ('NE','Niger','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('NF','Norfolk Island','AUD','Australian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('NG','Nigeria','NGN','Nigerian Naira','₦',2,true,'active','dotnet-region-2026-10-26'),
 ('NI','Nicaragua','NIO','Nicaraguan Córdoba','C$',2,true,'active','dotnet-region-2026-10-26'),
 ('NL','Netherlands','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('NO','Norway','NOK','Norwegian Krone','kr',2,true,'active','dotnet-region-2026-10-26'),
 ('NP','Nepal','NPR','Nepalese Rupee','रु',2,true,'active','dotnet-region-2026-10-26'),
 ('NR','Nauru','AUD','Australian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('NU','Niue','NZD','New Zealand Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('NZ','New Zealand','NZD','New Zealand Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('OM','Oman','OMR','Omani Rial','ر.ع.‏',3,true,'active','dotnet-region-2026-10-26'),
 ('PA','Panama','PAB','Panamanian Balboa','B/.',2,true,'active','dotnet-region-2026-10-26'),
 ('PE','Peru','PEN','Peruvian Sol','S/',2,true,'active','dotnet-region-2026-10-26'),
 ('PF','French Polynesia','XPF','CFP Franc','FCFP',0,true,'active','dotnet-region-2026-10-26'),
 ('PG','Papua New Guinea','PGK','Papua New Guinean Kina','K',2,true,'active','dotnet-region-2026-10-26'),
 ('PH','Philippines','PHP','Philippine Peso','₱',2,true,'active','dotnet-region-2026-10-26'),
 ('PK','Pakistan','PKR','Pakistani Rupee','Rs',2,true,'active','dotnet-region-2026-10-26'),
 ('PL','Poland','PLN','Polish Zloty','zł',2,true,'active','dotnet-region-2026-10-26'),
 ('PM','St. Pierre & Miquelon','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('PN','Pitcairn Islands','NZD','New Zealand Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('PR','Puerto Rico','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('PS','Palestinian Authority','ILS','Israeli New Shekel','₪',2,true,'active','dotnet-region-2026-10-26'),
 ('PT','Portugal','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('PW','Palau','USD','US Dollar','US$',2,true,'active','dotnet-region-2026-10-26'),
 ('PY','Paraguay','PYG','Paraguayan Guarani','₲',0,true,'active','dotnet-region-2026-10-26'),
 ('QA','Qatar','QAR','Qatari Riyal','ر.ق.‏',2,true,'active','dotnet-region-2026-10-26'),
 ('RE','Réunion','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('RO','Romania','RON','Romanian Leu','lei',2,true,'active','dotnet-region-2026-10-26'),
 ('RS','Serbia','RSD','Serbian Dinar','дин.',2,true,'active','dotnet-region-2026-10-26'),
 ('RU','Russia','RUB','Russian Ruble','₽',2,true,'active','dotnet-region-2026-10-26'),
 ('RW','Rwanda','RWF','Rwandan Franc','RF',0,true,'active','dotnet-region-2026-10-26'),
 ('SA','Saudi Arabia','SAR','Saudi Riyal','⃁',2,true,'active','dotnet-region-2026-10-26'),
 ('SB','Solomon Islands','SBD','Solomon Islands Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('SC','Seychelles','SCR','Seychellois Rupee','SR',2,true,'active','dotnet-region-2026-10-26'),
 ('SD','Sudan','SDG','Sudanese Pound','SDG',2,true,'active','dotnet-region-2026-10-26'),
 ('SE','Sweden','SEK','Swedish Krona','kr',2,true,'active','dotnet-region-2026-10-26'),
 ('SG','Singapore','SGD','Singapore Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('SH','St Helena, Ascension, Tristan da Cunha','SHP','Saint Helena Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('SI','Slovenia','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('SJ','Svalbard & Jan Mayen','NOK','Norwegian Krone','kr',2,true,'active','dotnet-region-2026-10-26'),
 ('SK','Slovakia','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('SL','Sierra Leone','SLE','Sierra Leonean Leone','Le',2,true,'active','dotnet-region-2026-10-26'),
 ('SM','San Marino','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('SN','Senegal','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('SO','Somalia','SOS','Somali Shilling','S',0,true,'active','dotnet-region-2026-10-26'),
 ('SR','Suriname','SRD','Surinamese Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('SS','South Sudan','SSP','South Sudanese Pound','£',2,true,'active','dotnet-region-2026-10-26'),
 ('ST','São Tomé & Príncipe','STN','São Tomé & Príncipe Dobra','Db',2,true,'active','dotnet-region-2026-10-26'),
 ('SV','El Salvador','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('SX','Sint Maarten','ANG','Netherlands Antillean Guilder','NAf.',2,true,'active','dotnet-region-2026-10-26'),
 ('SY','Syria','SYP','Syrian Pound','ܠ.ܣ.‏',2,true,'active','dotnet-region-2026-10-26'),
 ('SZ','Eswatini','SZL','Swazi Lilangeni','E',2,true,'active','dotnet-region-2026-10-26'),
 ('TC','Turks & Caicos Islands','USD','US Dollar','US$',2,true,'active','dotnet-region-2026-10-26'),
 ('TD','Chad','XAF','Central African CFA Franc','FCFA',0,true,'active','dotnet-region-2026-10-26'),
 ('TG','Togo','XOF','West African CFA Franc','F CFA',0,true,'active','dotnet-region-2026-10-26'),
 ('TH','Thailand','THB','Thai Baht','฿',2,true,'active','dotnet-region-2026-10-26'),
 ('TJ','Tajikistan','TJS','Tajikistani Somoni','смн',2,true,'active','dotnet-region-2026-10-26'),
 ('TK','Tokelau','NZD','New Zealand Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('TL','Timor-Leste','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('TM','Turkmenistan','TMT','Turkmenistani Manat','m.',2,true,'active','dotnet-region-2026-10-26'),
 ('TN','Tunisia','TND','Tunisian Dinar','DT',3,true,'active','dotnet-region-2026-10-26'),
 ('TO','Tonga','TOP','Tongan Paʻanga','T$',2,true,'active','dotnet-region-2026-10-26'),
 ('TR','Türkiye','TRY','Turkish Lira','₺',2,true,'active','dotnet-region-2026-10-26'),
 ('TT','Trinidad & Tobago','TTD','Trinidad & Tobago Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('TV','Tuvalu','AUD','Australian Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('TW','Taiwan','TWD','New Taiwan Dollar','NT$',2,true,'active','dotnet-region-2026-10-26'),
 ('TZ','Tanzania','TZS','Tanzanian Shilling','TSh',2,true,'active','dotnet-region-2026-10-26'),
 ('UA','Ukraine','UAH','Ukrainian Hryvnia','₴',2,true,'active','dotnet-region-2026-10-26'),
 ('UG','Uganda','UGX','Ugandan Shilling','USh',0,true,'active','dotnet-region-2026-10-26'),
 ('UM','U.S. Outlying Islands','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('US','United States','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('UY','Uruguay','UYU','Uruguayan Peso','$',2,true,'active','dotnet-region-2026-10-26'),
 ('UZ','Uzbekistan','UZS','Uzbekistani Som','сўм',2,true,'active','dotnet-region-2026-10-26'),
 ('VA','Vatican City','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('VC','St. Vincent & Grenadines','XCD','East Caribbean Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('VE','Venezuela','VES','Venezuelan Bolívar','Bs.S',2,true,'active','dotnet-region-2026-10-26'),
 ('VG','British Virgin Islands','USD','US Dollar','US$',2,true,'active','dotnet-region-2026-10-26'),
 ('VI','U.S. Virgin Islands','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26'),
 ('VN','Vietnam','VND','Vietnamese Dong','₫',0,true,'active','dotnet-region-2026-10-26'),
 ('VU','Vanuatu','VUV','Vanuatu Vatu','VT',0,true,'active','dotnet-region-2026-10-26'),
 ('WF','Wallis & Futuna','XPF','CFP Franc','FCFP',0,true,'active','dotnet-region-2026-10-26'),
 ('WS','Samoa','WST','Samoan Tala','WS$',2,true,'active','dotnet-region-2026-10-26'),
 ('XK','Kosovo','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('YE','Yemen','YER','Yemeni Rial','ر.ي.‏',2,true,'active','dotnet-region-2026-10-26'),
 ('YT','Mayotte','EUR','Euro','€',2,true,'active','dotnet-region-2026-10-26'),
 ('ZA','South Africa','ZAR','South African Rand','R',2,true,'active','dotnet-region-2026-10-26'),
 ('ZM','Zambia','ZMW','Zambian Kwacha','K',2,true,'active','dotnet-region-2026-10-26'),
 ('ZW','Zimbabwe','USD','US Dollar','$',2,true,'active','dotnet-region-2026-10-26')
;

CREATE FUNCTION reject_country_currency_catalog_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Country and currency reference mappings are immutable'
        USING ERRCODE='23514';
END
$$;
CREATE TRIGGER country_currency_catalog_immutable
    BEFORE UPDATE OR DELETE ON country_currency_catalog
    FOR EACH ROW EXECUTE FUNCTION reject_country_currency_catalog_mutation();

CREATE TABLE company_currency_profile (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
    base_country_code text CHECK (base_country_code IS NULL OR base_country_code ~ '^[A-Z]{2}$'),
    status text NOT NULL DEFAULT 'active' CHECK (status='active'),
    locked_at timestamptz,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_by text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id),
    UNIQUE (tenant_id,company_id,base_currency),
    FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,base_currency) REFERENCES currency(tenant_id,code) ON DELETE RESTRICT,
    FOREIGN KEY (base_country_code,base_currency)
        REFERENCES country_currency_catalog(country_code,currency_code) ON DELETE RESTRICT
);

CREATE TABLE company_currency (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    selected_country_code text NOT NULL CHECK (selected_country_code ~ '^[A-Z]{2}$'),
    is_base boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_by text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,currency_code),
    UNIQUE (tenant_id,company_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,currency_code) REFERENCES currency(tenant_id,code) ON DELETE RESTRICT,
    FOREIGN KEY (selected_country_code,currency_code)
        REFERENCES country_currency_catalog(country_code,currency_code) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX company_currency_one_base
    ON company_currency(tenant_id,company_id) WHERE is_base;
CREATE INDEX company_currency_directory
    ON company_currency(tenant_id,company_id,status,currency_code,id);

CREATE TABLE company_currency_event (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    entity_type text NOT NULL CHECK (entity_type IN ('profile','currency','rate')),
    entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 128),
    action text NOT NULL CHECK (action IN (
        'profile_created','currency_activated','currency_inactivated',
        'rate_created','rate_corrected','rate_activated','rate_inactivated'
    )),
    record_version bigint NOT NULL CHECK (record_version>0),
    actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
    correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 128),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_currency_event_history
    ON company_currency_event(tenant_id,company_id,entity_type,entity_id,occurred_at,id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM organization_unit company
         WHERE company.type='company'
           AND NOT EXISTS (
               SELECT 1 FROM currency base
                WHERE base.tenant_id=company.tenant_id
                  AND base.is_base AND base.status='active'
           )
    ) THEN
        RAISE EXCEPTION 'Every existing company requires one active tenant base currency before Platform 0011';
    END IF;
END
$$;

INSERT INTO company_currency_profile(
    tenant_id,company_id,id,base_currency,base_country_code,status,row_version
)
SELECT company.tenant_id,company.id,
       'ccp-'||md5(company.tenant_id||':'||company.id),
       base.code,
       mapping.country_code,
       'active',1
  FROM organization_unit company
  JOIN currency base
    ON base.tenant_id=company.tenant_id AND base.is_base AND base.status='active'
  LEFT JOIN LATERAL (
      SELECT catalog.country_code
        FROM country_currency_catalog catalog
       WHERE catalog.currency_code=base.code AND catalog.status='active'
       ORDER BY catalog.is_primary DESC,catalog.country_code
       LIMIT 1
  ) mapping ON true
 WHERE company.type='company';

INSERT INTO company_currency(
    tenant_id,company_id,id,currency_code,selected_country_code,is_base,status,row_version
)
SELECT profile.tenant_id,profile.company_id,
       'cc-'||md5(profile.tenant_id||':'||profile.company_id||':'||profile.base_currency),
       profile.base_currency,profile.base_country_code,true,'active',1
  FROM company_currency_profile profile;

CREATE FUNCTION guard_company_currency_profile() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE has_posted boolean := false;
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Company currency profiles cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.created_by,NEW.created_at)
           IS DISTINCT FROM
           (OLD.tenant_id,OLD.company_id,OLD.id,OLD.created_by,OLD.created_at) THEN
            RAISE EXCEPTION 'Company currency profile identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
            RAISE EXCEPTION 'Company currency profile version must advance' USING ERRCODE='40001';
        END IF;
        IF NEW.base_currency IS DISTINCT FROM OLD.base_currency THEN
            IF to_regclass('public.journal_entry') IS NOT NULL THEN
                EXECUTE
                    'SELECT EXISTS(SELECT 1 FROM public.journal_entry '
                    'WHERE tenant_id=$1 AND company_id=$2 AND status IN (''posted'',''reversed''))'
                    INTO has_posted USING NEW.tenant_id,NEW.company_id;
            END IF;
            IF has_posted OR OLD.locked_at IS NOT NULL THEN
                RAISE EXCEPTION 'Company base currency is locked after the first posted journal'
                    USING ERRCODE='23514';
            END IF;
        END IF;
    ELSIF NEW.row_version<>1 THEN
        RAISE EXCEPTION 'New company currency profiles require version one' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER company_currency_profile_guard
    BEFORE INSERT OR UPDATE OR DELETE ON company_currency_profile
    FOR EACH ROW EXECUTE FUNCTION guard_company_currency_profile();

CREATE FUNCTION guard_company_currency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Company currencies cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.currency_code,NEW.selected_country_code,
            NEW.is_base,NEW.created_by,NEW.created_at)
           IS DISTINCT FROM
           (OLD.tenant_id,OLD.company_id,OLD.id,OLD.currency_code,OLD.selected_country_code,
            OLD.is_base,OLD.created_by,OLD.created_at) THEN
            RAISE EXCEPTION 'Company currency identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
            RAISE EXCEPTION 'Company currency version must advance' USING ERRCODE='40001';
        END IF;
        IF OLD.is_base AND NEW.status<>'active' THEN
            RAISE EXCEPTION 'The company base currency cannot be deactivated' USING ERRCODE='23514';
        END IF;
    ELSIF NEW.row_version<>1 THEN
        RAISE EXCEPTION 'New company currencies require version one' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER company_currency_guard
    BEFORE INSERT OR UPDATE OR DELETE ON company_currency
    FOR EACH ROW EXECUTE FUNCTION guard_company_currency();

ALTER TABLE currency_rate
    ADD COLUMN company_id text,
    ADD CONSTRAINT currency_rate_company_fk
        FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT currency_rate_company_currency_fk
        FOREIGN KEY(tenant_id,company_id,source_currency)
        REFERENCES company_currency(tenant_id,company_id,currency_code) ON DELETE RESTRICT,
    ADD CONSTRAINT currency_rate_company_identity_unique UNIQUE(tenant_id,company_id,id);

DROP INDEX currency_rate_one_current_revision;
CREATE UNIQUE INDEX currency_rate_legacy_one_current_revision
    ON currency_rate(tenant_id,source_currency,target_currency,effective_date)
    WHERE company_id IS NULL AND status<>'superseded';
CREATE UNIQUE INDEX currency_rate_company_one_current_revision
    ON currency_rate(tenant_id,company_id,source_currency,target_currency,effective_date)
    WHERE company_id IS NOT NULL AND status<>'superseded';
CREATE INDEX currency_rate_company_active_lookup
    ON currency_rate(tenant_id,company_id,source_currency,target_currency,effective_date DESC,id DESC)
    WHERE company_id IS NOT NULL AND status='active';

CREATE OR REPLACE FUNCTION guard_currency_rate_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Currency rates cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.row_version<>1 OR NEW.status='superseded' THEN
            RAISE EXCEPTION 'New currency rates require version one and a current status' USING ERRCODE='23514';
        END IF;
        IF NEW.company_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM company_currency_profile profile
             WHERE profile.tenant_id=NEW.tenant_id AND profile.company_id=NEW.company_id
               AND profile.base_currency=NEW.target_currency AND profile.status='active'
        ) THEN
            RAISE EXCEPTION 'Company rates must target the company base currency' USING ERRCODE='23514';
        END IF;
        IF NEW.supersedes_rate_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM currency_rate previous
             WHERE previous.tenant_id=NEW.tenant_id AND previous.id=NEW.supersedes_rate_id
               AND previous.company_id IS NOT DISTINCT FROM NEW.company_id
               AND previous.source_currency=NEW.source_currency
               AND previous.target_currency=NEW.target_currency
               AND previous.effective_date=NEW.effective_date
               AND previous.status='superseded'
        ) THEN
            RAISE EXCEPTION 'Corrected rate must reference the same-company superseded revision'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id,NEW.id,NEW.company_id,NEW.source_currency,NEW.target_currency,NEW.rate,
        NEW.effective_date,NEW.created_at,NEW.created_by,NEW.supersedes_rate_id,NEW.reason)
       IS DISTINCT FROM
       (OLD.tenant_id,OLD.id,OLD.company_id,OLD.source_currency,OLD.target_currency,OLD.rate,
        OLD.effective_date,OLD.created_at,OLD.created_by,OLD.supersedes_rate_id,OLD.reason) THEN
        RAISE EXCEPTION 'Currency rate facts are immutable; create a correction revision'
            USING ERRCODE='23514';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
        RAISE EXCEPTION 'Currency rate version and update time must advance' USING ERRCODE='40001';
    END IF;
    IF OLD.status='superseded' OR NEW.status=OLD.status
       OR (NEW.status='superseded' AND OLD.status<>'active') THEN
        RAISE EXCEPTION 'Invalid currency rate status transition' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE FUNCTION company_currency_scope_access(target_tenant text,target_company text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE allowed boolean := false;
BEGIN
    IF target_tenant IS DISTINCT FROM current_setting('nexora.tenant_id',true) THEN
        RETURN false;
    END IF;
    IF to_regclass('public.security_user_company_access') IS NULL THEN
        RETURN false;
    END IF;
    EXECUTE
        'SELECT EXISTS(SELECT 1 FROM public.security_user_company_access '
        'WHERE tenant_id=$1 AND company_id=$2 AND user_id=$3 AND revoked_at IS NULL)'
        INTO allowed
        USING target_tenant,target_company,current_setting('nexora.user_id',true);
    RETURN allowed;
END
$$;

DO $$
DECLARE relation text;
BEGIN
    FOREACH relation IN ARRAY ARRAY[
        'company_currency_profile','company_currency','company_currency_event'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
        EXECUTE format(
            'CREATE POLICY company_currency_company_isolation ON %I '
            'USING (company_currency_scope_access(tenant_id,company_id)) '
            'WITH CHECK (company_currency_scope_access(tenant_id,company_id))',relation
        );
    END LOOP;
END
$$;
CREATE TRIGGER company_currency_event_immutable
    BEFORE UPDATE OR DELETE ON company_currency_event
    FOR EACH ROW EXECUTE FUNCTION reject_country_currency_catalog_mutation();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('platform',11,'company_currency_profiles');
