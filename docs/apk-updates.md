# APK-updates voor bestaande OVbord-gebruikers

Dit is een JavaScript-only update voor de bestaande Expo runtime **1.0.4**. Er worden geen nieuwe native packages of installatiepermissies gebruikt. De app controleert op de voorgrond, bij opstarten en daarna hoogstens eens per zes uur de volgende URL:

`https://ovspot.nl/ovbord/android-release.json`

Als het bestand ontbreekt, ongeldig is of geen `status: "published"` heeft, verschijnt **geen** APK-banner. Zo kan de OTA-functie alvast worden uitgerold voordat een native APK is goedgekeurd.

## Manifest (voorbeeld, nog NIET publiceren)

```json
{
  "schema": 1,
  "platform": "android",
  "status": "published",
  "version": "1.0.5",
  "versionCode": 6,
  "apkUrl": "https://ovspot.nl/downloads/ovbord-1.0.5.apk",
  "notes": "Android-widget en optionele uitstapherinneringen"
}
```

De APK-URL is een **plaatsaanduiding**, geen geverifieerd bestaand downloadadres. Publiceer dit voorbeeld nooit voordat het bestand beschikbaar en getest is.

De app accepteert alleen HTTPS-APK-URLs op eigen toegestane domeinen. Tikken opent de externe downloadpagina; Android vereist toestemming voor sideload-installatie, er gebeurt geen stille installatie. De melding heeft een knop `Later` die deze versie 24 uur uitstelt. Bestaande OTA-meldingen hebben voorrang.

## Uitrolchecklist

1. Controleer via welke EAS-channel en runtime de APK op de website is gebouwd; een OTA naar `preview` bereikt alleen bijpassende installaties.
2. Test de 1.0.5 APK op een echt toestel: widget, meldingen, favorieten en instellingen.
3. Verifieer de Android-app-ID `nl.ovbord.app`, ondertekeningscertificaat en dat versionCode 6 hoger is dan de publiek verspreide 1.0.4.
4. Host de goedgekeurde APK op een vaste HTTPS-URL onder ovspot.nl of ovbord.nl. Controleer de daadwerkelijke download.
5. Zet pas dan het JSON-manifest op `published`; stop de aanbieding door het manifest te verwijderen of op `draft` te zetten.
6. Neem deze updatechecker ook over in toekomstige native builds, zodat latere APK-updates mogelijk blijven.

Zonder nieuw native pakket kan de huidige 1.0.4 wel de downloadmelding via OTA ontvangen, maar niet zelfstandig de Android-widget uit een 1.0.5 APK installeren.
