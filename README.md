# OVbord app

Mobiele React Native-app voor OVbord, gebouwd met Expo, TypeScript en Expo Router.

## Stack

- Expo SDK 57
- React Native 0.86
- TypeScript
- Expo Router
- react-native-maps
- AsyncStorage voor lokale voorkeuren en favorieten
- OVbord API via `https://ovbord.nl`

## Schermen

- Start: nabij, recent en favorieten
- Haltebord: vertrekken, aankomsten en storingen
- Ritpagina: kaart en ritverloop
- Buurtbord: haltes op kaart en lijst
- Favorieten
- Instellingen: thema en meldingen

## Installeren op Windows

Vereisten:

- Node.js 22.13 of nieuwer
- Git
- Expo Go op een testtelefoon, of Android Studio voor een emulator

```bash
git clone https://github.com/nickdenboer7-dev/ovbord-app.git
cd ovbord-app
npm install
npx expo start
```

Scan daarna de QR-code met Expo Go of druk op `a` om Android te openen.

## Handige commando's

```bash
npm run start
npm run android
npm run ios
npm run web
npm run typecheck
```

## API

De app gebruikt deze OVbord-endpoints:

- `GET /api/search?q=...`
- `GET /api/nearby?lat=...&lon=...`
- `GET /api/halte/{id}`
- `GET /api/rit/{id}`

De basis-URL staat in `lib/api.ts` als `https://ovbord.nl`.

## Thema

Licht is standaard. In Instellingen kan gekozen worden voor Licht, Donker of Systeem. De primaire OVbord-kleur is `#1D6F42`.

## Privacy

Locatie wordt alleen op het apparaat opgevraagd voor het tonen van haltes in de buurt. De app vraagt foreground-locatietoestemming via Expo Location.
