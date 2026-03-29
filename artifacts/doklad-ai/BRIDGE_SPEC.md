# Doklad.ai — Specifikace JS Bridge pro mobilní aplikaci

Mobilní aplikace (Expo React Native) komunikuje s webem `https://doklad.ai` přes WebView pomocí `postMessage` protokolu. Tento dokument popisuje, co musí webová strana implementovat.

---

## 1. Příjem zpráv z nativní aplikace

Web musí naslouchat zprávám přes `window.addEventListener('message', ...)`. Každá zpráva je JSON string s touto strukturou:

```typescript
interface BridgeMessage {
  action: string;       // typ zprávy
  payload: object;      // data zprávy
  timestamp: number;    // Unix timestamp v ms
}
```

### Registrace listeneru

```javascript
window.addEventListener('message', (event) => {
  let data;
  try {
    data = JSON.parse(typeof event.data === 'string' ? event.data : JSON.stringify(event.data));
  } catch {
    return; // ignorovat ne-JSON zprávy
  }

  switch (data.action) {
    case 'DOCUMENT_SCANNED':
      handleDocumentScanned(data.payload);
      break;
    case 'NOTIFICATION_TOKEN':
      handleNotificationToken(data.payload);
      break;
    case 'BIOMETRIC_STATUS':
      handleBiometricStatus(data.payload);
      break;
    case 'APP_READY':
      handleAppReady(data.payload);
      break;
  }
});
```

**Alternativně** — aplikace také volá `window.DokladBridge.onMessage(json)`, pokud tento objekt existuje:

```javascript
window.DokladBridge = {
  onMessage(jsonString) {
    const data = JSON.parse(jsonString);
    // zpracovat stejně jako výše
  }
};
```

---

## 2. Typy zpráv (nativní → web)

### `APP_READY`
Odesláno při načtení stránky. Informuje web, že běží v nativní aplikaci.

| Pole v payload    | Typ      | Popis                              |
|-------------------|----------|------------------------------------|
| `biometricEnabled`| boolean  | Zda má uživatel zapnutou biometrii |
| `pushToken`       | string?  | Expo push token (může být null)    |
| `platform`        | string   | `"ios"` nebo `"android"`           |

**Použití:** Web může přizpůsobit UI (skrýt webový login, zobrazit nativní funkce apod.)

---

### `DOCUMENT_SCANNED`
Odesláno po naskenování dokladu kamerou nebo výběru z galerie.

| Pole v payload | Typ    | Popis                                    |
|----------------|--------|------------------------------------------|
| `base64`       | string | Obrázek zakódovaný v base64              |
| `filename`     | string | Název souboru, např. `doklad_1711700000000.jpg` |
| `mimeType`     | string | Vždy `"image/jpeg"`                      |
| `capturedAt`   | number | Unix timestamp v ms kdy byl snímek pořízen |

**Použití:** Web převede base64 na soubor a nahraje ho do systému (např. jako přílohu faktury, účtenky).

```javascript
function handleDocumentScanned(payload) {
  const { base64, filename, mimeType, capturedAt } = payload;

  // Převod base64 na Blob
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });

  // Nahrát soubor na server
  uploadDocument(file);
}
```

---

### `NOTIFICATION_TOKEN`
Odesláno při startu a kdykoliv se token změní.

| Pole v payload | Typ    | Popis                                  |
|----------------|--------|----------------------------------------|
| `token`        | string | Expo push token, formát: `ExponentPushToken[xxx]` |

**Použití:** Uložit token na server pro posílání push notifikací uživateli.

```javascript
function handleNotificationToken(payload) {
  fetch('/api/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pushToken: payload.token })
  });
}
```

**Posílání notifikací z backendu:**
```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxx]",
    "title": "Nová faktura",
    "body": "Máte novou fakturu k zaplacení",
    "data": { "url": "/invoices/123" }
  }'
```

---

### `BIOMETRIC_STATUS`
Odesláno při startu a kdykoliv uživatel změní nastavení biometrie.

| Pole v payload | Typ     | Popis                           |
|----------------|---------|----------------------------------|
| `enabled`      | boolean | Zda má uživatel zapnutou biometrii |

---

## 3. Příkazy z webu do nativní aplikace (web → nativní)

Web může poslat příkazy nativní aplikaci přes `postMessage`:

```javascript
// Otevřít skener dokladů
window.ReactNativeWebView.postMessage(JSON.stringify({
  action: 'OPEN_SCANNER'
}));

// Otevřít nativní nastavení
window.ReactNativeWebView.postMessage(JSON.stringify({
  action: 'OPEN_SETTINGS'
}));
```

**Poznámka:** `window.ReactNativeWebView` je dostupný pouze pokud web běží uvnitř nativní aplikace. Zkontrolujte jeho existenci:

```javascript
function isInNativeApp() {
  return !!window.ReactNativeWebView;
}

// Příklad: Zobrazit tlačítko "Skenovat" jen v nativní appce
if (isInNativeApp()) {
  showScanButton();
}
```

---

## 4. Povolené domény

Nativní aplikace povoluje navigaci pouze na tyto domény:
- `doklad.ai`
- `www.doklad.ai`
- `app.doklad.ai`

Odkazy na jiné domény se otevřou v systémovém prohlížeči (Safari/Chrome).

---

## 5. Push notifikace — formát

Pro posílání push notifikací používejte [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/):

| Pole     | Typ    | Popis                                  |
|----------|--------|----------------------------------------|
| `to`     | string | Expo push token                        |
| `title`  | string | Nadpis notifikace                      |
| `body`   | string | Text notifikace                        |
| `data`   | object | Volitelná data (např. `{ url: "..." }`) |
| `sound`  | string | `"default"` pro zvuk                   |
| `badge`  | number | Počet na ikoně (iOS)                   |

---

## 6. Shrnutí — co implementovat

| Priorita | Úkol | Popis |
|----------|------|-------|
| **Vysoká** | Listener na `message` | Registrovat `window.addEventListener('message', ...)` |
| **Vysoká** | `DOCUMENT_SCANNED` | Převést base64 na soubor a nahrát do systému |
| **Vysoká** | `NOTIFICATION_TOKEN` | Uložit push token na server |
| **Střední** | `APP_READY` | Detekovat nativní appku, přizpůsobit UI |
| **Střední** | `OPEN_SCANNER` | Přidat tlačítko pro otevření skeneru z webu |
| **Nízká** | `BIOMETRIC_STATUS` | Logovat/zobrazit stav biometrie |
| **Nízká** | `OPEN_SETTINGS` | Přidat odkaz na nativní nastavení |
