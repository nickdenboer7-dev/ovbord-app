# Update 3 — Android extra functies (aparte native build)

- Branch: `feature/android-extra-v105` (niet de OTA-branch).
- Expo SDK blijft **57**. Widget-bibliotheek: `react-native-android-widget@0.22.1` met Expo-configplugin.
- Android home-screen widget `MijnHalte`: de eerste favoriete halte met maximaal drie vertrektijden. **Kloktijden**, geen stilstaande minuten-afteller. Elke weergave is een momentopname; automatisch bijwerken door Android gebeurt op zijn vroegst na circa 30 minuten, en ook wanneer de app wordt geopend of de gebruiker op **Widget nu vernieuwen** tikt. Gebruiker voegt widget toe via **Meer > Android > Widget op startscherm**; als de launcher de snelkoppeling niet ondersteunt: widgetmenu op startscherm.
- Lokale uitstapherinneringen via `expo-notifications@~57.0.18`: **standaard uit** en Android-notificatietoestemming uitsluitend bij bewust inschakelen. Eenmalige melding circa vijf minuten vóór de in ritverloop geselecteerde uitstaphalte. De klok volgt de laatst bekende verwachte aankomst; bij andere uitstaphalte/gewijzigde tijd herplannen, bij einde rit en uitschakelen annuleren. Android kan bezorging vertragen; geen exacte alarmrechten, GPS-belofte of server-push.
- Appversie en Expo runtime: **1.0.5**, Android versionCode **6**. Expo SDK 57 blijft ongewijzigd. Native wijzigingen kunnen niet via OTA naar runtime 1.0.4.
- De bestaande **preview/Android OTA 1.0.4** blijft op updategroep `770c2d0e-d68e-407c-9d5d-256fb21ac649`. Bij een afzonderlijke native preview APK wordt alleen de ingebedde app van 1.0.5 getest. Gebruik geen `eas update` voor deze branch.

## Toesteltest (na installatie van de nieuwe APK)

1. Open **Meer > Android · extra functies**. Sla een halte op in Favorieten.
2. Voeg de widget toe aan het Android-startscherm en controleer naam, badges, tijden en dat tikken **Favorieten** opent.
3. Verander de eerste favoriete halte; open de app en controleer dat de widget opnieuw geladen wordt. Test ook netwerk uit (gecachete tijden gemarkeerd).
4. Zet de uitstapherinnering aan en sta Android-meldingen toe. Open een rit die over minstens zes minuten bij een gekozen uitstaphalte arriveert. Controleer dat er maximaal één notificatie gepland is, ongeveer vijf minuten voor aankomst.
5. Wijzig of verwijder je uitstaphalte en controleer dat de herinnering aangepast of geannuleerd wordt. Zet de schakelaar uit en bevestig dat er geen nieuwe meldingen verschijnen.
6. Controleer dat de geïnstalleerde versie **1.0.5** toont en dat runtime **1.0.4** op de oude installatie ongewijzigd blijft.

Beperkingen: widget-updatefrequentie en exacte bezorgtijd worden door Android/launcher bepaald; een echte Android-build en toesteltest zijn vereist om native functionaliteit volledig af te tekenen.
