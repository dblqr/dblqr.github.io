// UI strings in every supported language, plus translation helpers.
// English is the source of truth; test.js checks that every language has
// exactly the English keys and the same {placeholders}.
//
// build.js bakes these into one static page per language. Strings containing
// <strong> markup are inserted as HTML (they are constants defined here, never
// user input); everything else is HTML-escaped.

// Each language has its own statically built page (see build.js), so search
// engines can index every translation.
const LANGUAGES = [
    { code: 'en', name: 'English', path: '/' },
    { code: 'ja', name: '日本語', path: '/ja/' },
    { code: 'es', name: 'Español', path: '/es/' },
    { code: 'pt-BR', name: 'Português (Brasil)', path: '/pt-br/' },
];

const STRINGS = {
    en: {
        'page.appName': 'Shenron & Porunga QR Generator',
        'page.ogTitle': 'Shenron & Porunga QR Code Generator (Dragon Ball Legends)',
        'page.ogDescription': 'Turn friend codes into scannable Shenron/Porunga event QR codes and track your 3 daily scans. Unofficial fan tool.',
        'page.ogImageAlt': 'Shenron & Porunga QR Generator: a QR code next to the site name',
        'page.title': 'Shenron & Porunga QR Generator – Dragon Ball Legends (Unofficial)',
        'page.description': 'Generate the timestamped QR codes for the Dragon Ball Legends Shenron and Porunga Dragon Ball events from friend codes, and track your 3 daily scans. Unofficial fan tool.',
        'header.title': 'Shenron & Porunga QR Generator',
        'header.subtitle': 'For the Dragon Ball Legends Dragon Ball events · unofficial fan tool',
        'language.label': 'Language',
        'actions.scan': 'Scan QR Codes',
        'actions.scanDesc': 'Use camera or upload a screenshot',
        'actions.export': 'Export Friend Codes',
        'actions.exportDesc': 'Save codes to a .txt file',
        'actions.upload': 'Upload Friend Codes',
        'actions.uploadDesc': 'Load codes from a .txt file',
        'actions.refresh': 'Refresh now',
        'actions.clear': 'Clear all',
        'empty.intro': 'No friend codes added yet. Get started:',
        'empty.type': 'Type friend codes into the fields above',
        'empty.scan': 'Tap <strong>Scan QR Codes</strong> to scan from a friend\'s screen',
        'empty.upload': 'Tap <strong>Upload Friend Codes</strong> to load from a .txt file',
        'how.title': 'How It Works',
        'how.step1': 'Enter up to 6 friend codes by typing them in, scanning QR codes, or uploading a text file.',
        'how.step2': 'The app generates a time-stamped QR code for each friend code that the Shenron and Porunga events can scan in-game.',
        'how.step3': 'Each code counts once per day and the event needs 3 a day. Tap <strong>Start daily scans</strong> to step through your codes one at a time; extra codes are spares if one doesn\'t work. Progress resets with the game at 1:00 AM Pacific time.',
        'how.step4': 'QR codes auto-refresh every 10 seconds to stay valid for the game. Tap a QR code to enlarge it for scanning.',
        'how.step5': 'Share your codes with friends by exporting to a .txt file or letting them scan your screen.',
        'how.step6': 'Downloaded QR images contain the time they were made, so they may stop working after a while. Download a fresh one when you need it.',
        'footer.disclaimer': 'Unofficial fan tool. Not affiliated with Bandai Namco Entertainment. Dragon Ball Legends and related names are trademarks of their respective owners.',
        'scanner.retry': 'Re-enable camera',
        'scanner.uploadPrompt': 'Or upload a screenshot of the QR code:',
        'scanner.tip': 'Tip: Use landscape orientation for player profile screenshots',
        'scanner.uploadButton': 'Upload Image',
        'scanner.prev': 'Previous slot',
        'scanner.next': 'Next slot',
        'scanner.close': 'Close scanner',
        'scanner.title': 'Scan Friend Code {slot} of {total}',
        'scanner.titleReplace': 'Scan Friend Code {slot} of {total} (replaces {code})',
        'scanner.point': 'Point your camera at a QR code',
        'scanner.permissionDenied': 'Camera error: permissions denied',
        'scanner.cameraError': 'Camera error: {message}',
        'scanner.unknownError': 'unknown error',
        'scanner.invalid': 'Invalid QR code format. Try another.',
        'scanner.alreadyScanned': 'Already scanned this code. Try a different one.',
        'scanner.alreadyInList': 'That code is already in your list. Try a different one.',
        'scanner.scannedNext': 'Code {count} scanned! Point at the next QR code.',
        'scanner.imported': '{count} code(s) imported',
        'scanner.allScanned': 'All {total} friend codes scanned!',
        'scanner.importedFull': '{count} code(s) imported. All slots are full.',
        'scanner.loadFailed': 'Couldn\'t load the scanner. Check your connection and try again.',
        'scanner.noQrInImage': 'No QR code found in image. Try another.',
        'daily.title': 'Daily scans',
        'daily.start': 'Start daily scans',
        'daily.close': 'Close daily scans',
        'daily.skip': 'Skip',
        'daily.done': 'Scanned ✓ Next',
        'daily.progress': 'Scanned today: {count} of {goal}',
        'daily.resetsAt': 'Resets at {time} your time',
        'daily.goalReached': 'Daily goal reached! You\'ve scanned {count} codes today. Keep going if you like.',
        'daily.alreadyScanned': 'Already scanned today ✓',
        'daily.onlyCode': 'This is your only code.',
        'zoom.hint': 'Tap anywhere to close',
        'consent.label': 'Analytics consent',
        'consent.text': 'This site uses Google Analytics to understand how it is used. Allow analytics cookies?',
        'consent.decline': 'Decline',
        'consent.allow': 'Allow',
        'toast.downloaded': 'Downloaded!',
        'toast.refreshed': 'QRs refreshed!',
        'toast.nothingToExport': 'No friend codes to export',
        'toast.exported': 'Friend codes exported!',
        'toast.noValidInFile': 'No valid friend codes found in file',
        'toast.uploaded': '{count} code(s) uploaded!',
        'toast.cleared': 'Friend codes cleared!',
        'toast.undo': 'Undo',
        'toast.restored': 'Friend codes restored',
        'qr.sectionTitle': 'Your QR codes',
        'card.label': 'Friend Code {slot}: {code}',
        'card.download': 'Download QR Code',
        'card.downloadLabel': 'Download QR code for friend code {slot}',
        'card.enlargeLabel': 'Enlarge QR code for friend code {slot}',
        'card.markScanned': 'Mark scanned',
        'card.scannedToday': 'Scanned today ✓',
        'input.groupLabel': 'Friend codes',
        'input.placeholder': 'e.g. ab12cd34',
        'input.label': 'Friend code {slot}',
        'input.title': '8-character alphanumeric code',
        'refresh.countdown': 'Refreshing in {seconds}s',
    },

    ja: {
        'page.appName': 'シェンロン＆ポルンガ QRジェネレーター',
        'page.ogTitle': 'シェンロン＆ポルンガ QRコードジェネレーター（ドラゴンボール レジェンズ）',
        'page.ogDescription': 'フレンドコードを、シェンロン・ポルンガのイベントで読み取れるQRコードに変換し、1日3回のスキャンを記録できます。非公式のファンツールです。',
        'page.ogImageAlt': 'シェンロン＆ポルンガ QRジェネレーター：QRコードとサイト名',
        'page.title': 'シェンロン＆ポルンガ QRジェネレーター – ドラゴンボール レジェンズ（非公式）',
        'page.description': 'フレンドコードから、ドラゴンボール レジェンズのシェンロン・ポルンガのドラゴンボールイベント用タイムスタンプ付きQRコードを作成し、1日3回のスキャンを記録できます。非公式のファンツールです。',
        'header.title': 'シェンロン＆ポルンガ QRジェネレーター',
        'header.subtitle': 'ドラゴンボール レジェンズのドラゴンボールイベント用 · 非公式ファンツール',
        'language.label': '言語',
        'actions.scan': 'QRコードをスキャン',
        'actions.scanDesc': 'カメラまたはスクリーンショットを使用',
        'actions.export': 'フレンドコードを書き出す',
        'actions.exportDesc': 'コードを.txtファイルに保存',
        'actions.upload': 'フレンドコードを読み込む',
        'actions.uploadDesc': '.txtファイルからコードを読み込む',
        'actions.refresh': '今すぐ更新',
        'actions.clear': 'すべてクリア',
        'empty.intro': 'フレンドコードがまだありません。はじめに：',
        'empty.type': '上の入力欄にフレンドコードを入力',
        'empty.scan': '<strong>QRコードをスキャン</strong>をタップして、フレンドの画面から読み取る',
        'empty.upload': '<strong>フレンドコードを読み込む</strong>をタップして、.txtファイルから読み込む',
        'how.title': '使い方',
        'how.step1': 'フレンドコードを最大6件、入力・QRコードのスキャン・テキストファイルの読み込みで追加します。',
        'how.step2': '各フレンドコードについて、ゲーム内のシェンロン・ポルンガのイベントで読み取れるタイムスタンプ付きQRコードを作成します。',
        'how.step3': '各コードは1日1回カウントされ、イベントには1日3回必要です。<strong>今日のスキャンを開始</strong>をタップすると、コードを1つずつ表示します。余ったコードは読み取れなかったときの予備になります。進捗はゲームと同じく太平洋時間の午前1時にリセットされます。',
        'how.step4': 'QRコードはゲームで有効な状態を保つため、10秒ごとに自動更新されます。QRコードをタップすると拡大表示できます。',
        'how.step5': 'コードは.txtファイルに書き出すか、画面をスキャンしてもらってフレンドと共有できます。',
        'how.step6': 'ダウンロードしたQR画像には作成時刻が含まれるため、時間が経つと使えなくなる場合があります。必要なときに新しくダウンロードしてください。',
        'footer.disclaimer': '非公式のファンツールです。株式会社バンダイナムコエンターテインメントとは関係ありません。ドラゴンボール レジェンズおよび関連する名称は、それぞれの権利者の商標です。',
        'scanner.retry': 'カメラを再度有効にする',
        'scanner.uploadPrompt': 'またはQRコードのスクリーンショットをアップロード：',
        'scanner.tip': 'ヒント：プレイヤープロフィールのスクリーンショットは横向きで撮影してください',
        'scanner.uploadButton': '画像をアップロード',
        'scanner.prev': '前のスロット',
        'scanner.next': '次のスロット',
        'scanner.close': 'スキャナーを閉じる',
        'scanner.title': 'フレンドコード {slot} / {total} をスキャン',
        'scanner.titleReplace': 'フレンドコード {slot} / {total} をスキャン（{code} を置き換え）',
        'scanner.point': 'カメラをQRコードに向けてください',
        'scanner.permissionDenied': 'カメラエラー：権限が拒否されました',
        'scanner.cameraError': 'カメラエラー：{message}',
        'scanner.unknownError': '不明なエラー',
        'scanner.invalid': 'QRコードの形式が無効です。別のコードをお試しください。',
        'scanner.alreadyScanned': 'このコードはスキャン済みです。別のコードをお試しください。',
        'scanner.alreadyInList': 'このコードはすでにリストにあります。別のコードをお試しください。',
        'scanner.scannedNext': '{count}件目をスキャンしました！次のQRコードに向けてください。',
        'scanner.imported': '{count}件のコードを取り込みました',
        'scanner.allScanned': '{total}件すべてのフレンドコードをスキャンしました！',
        'scanner.importedFull': '{count}件のコードを取り込みました。すべてのスロットが埋まりました。',
        'scanner.loadFailed': 'スキャナーを読み込めませんでした。接続を確認して、もう一度お試しください。',
        'scanner.noQrInImage': '画像にQRコードが見つかりません。別の画像をお試しください。',
        'daily.title': '今日のスキャン',
        'daily.start': '今日のスキャンを開始',
        'daily.close': '今日のスキャンを閉じる',
        'daily.skip': 'スキップ',
        'daily.done': 'スキャン済み ✓ 次へ',
        'daily.progress': '今日のスキャン：{count} / {goal}',
        'daily.resetsAt': 'リセット：{time}（お住まいの地域の時刻）',
        'daily.goalReached': '今日の目標達成！今日は{count}件スキャンしました。このまま続けてもOKです。',
        'daily.alreadyScanned': '今日スキャン済み ✓',
        'daily.onlyCode': 'コードはこれ1つだけです。',
        'zoom.hint': 'どこかをタップして閉じる',
        'consent.label': 'アナリティクスの同意',
        'consent.text': 'このサイトでは、利用状況を把握するためにGoogle アナリティクスを使用しています。アナリティクスCookieを許可しますか？',
        'consent.decline': '拒否',
        'consent.allow': '許可',
        'toast.downloaded': 'ダウンロードしました！',
        'toast.refreshed': 'QRコードを更新しました！',
        'toast.nothingToExport': '書き出すフレンドコードがありません',
        'toast.exported': 'フレンドコードを書き出しました！',
        'toast.noValidInFile': 'ファイルに有効なフレンドコードが見つかりません',
        'toast.uploaded': '{count}件のコードを読み込みました！',
        'toast.cleared': 'フレンドコードをクリアしました！',
        'toast.undo': '元に戻す',
        'toast.restored': 'フレンドコードを復元しました',
        'qr.sectionTitle': 'あなたのQRコード',
        'card.label': 'フレンドコード {slot}：{code}',
        'card.download': 'QRコードをダウンロード',
        'card.downloadLabel': 'フレンドコード{slot}のQRコードをダウンロード',
        'card.enlargeLabel': 'フレンドコード{slot}のQRコードを拡大',
        'card.markScanned': 'スキャン済みにする',
        'card.scannedToday': '今日スキャン済み ✓',
        'input.groupLabel': 'フレンドコード',
        'input.placeholder': '例：ab12cd34',
        'input.label': 'フレンドコード {slot}',
        'input.title': '8文字の英数字コード',
        'refresh.countdown': '{seconds}秒後に更新',
    },

    es: {
        'page.appName': 'Generador QR de Shenron y Porunga',
        'page.ogTitle': 'Generador de códigos QR de Shenron y Porunga (Dragon Ball Legends)',
        'page.ogDescription': 'Convierte códigos de amigo en códigos QR escaneables para los eventos de Shenron y Porunga y lleva la cuenta de tus 3 escaneos diarios. Herramienta no oficial hecha por fans.',
        'page.ogImageAlt': 'Generador QR de Shenron y Porunga: un código QR junto al nombre del sitio',
        'page.title': 'Generador QR de Shenron y Porunga – Dragon Ball Legends (no oficial)',
        'page.description': 'Genera los códigos QR con marca de tiempo para los eventos de las Esferas del Dragón de Shenron y Porunga en Dragon Ball Legends a partir de códigos de amigo, y lleva la cuenta de tus 3 escaneos diarios. Herramienta no oficial hecha por fans.',
        'header.title': 'Generador QR de Shenron y Porunga',
        'header.subtitle': 'Para los eventos de las Esferas del Dragón de Dragon Ball Legends · herramienta no oficial hecha por fans',
        'language.label': 'Idioma',
        'actions.scan': 'Escanear códigos QR',
        'actions.scanDesc': 'Usa la cámara o sube una captura de pantalla',
        'actions.export': 'Exportar códigos de amigo',
        'actions.exportDesc': 'Guarda los códigos en un archivo .txt',
        'actions.upload': 'Subir códigos de amigo',
        'actions.uploadDesc': 'Carga códigos desde un archivo .txt',
        'actions.refresh': 'Actualizar ahora',
        'actions.clear': 'Borrar todo',
        'empty.intro': 'Aún no has añadido códigos de amigo. Para empezar:',
        'empty.type': 'Escribe códigos de amigo en los campos de arriba',
        'empty.scan': 'Toca <strong>Escanear códigos QR</strong> para escanear desde la pantalla de un amigo',
        'empty.upload': 'Toca <strong>Subir códigos de amigo</strong> para cargarlos desde un archivo .txt',
        'how.title': 'Cómo funciona',
        'how.step1': 'Añade hasta 6 códigos de amigo escribiéndolos, escaneando códigos QR o subiendo un archivo de texto.',
        'how.step2': 'La app genera un código QR con marca de tiempo para cada código de amigo, que los eventos de Shenron y Porunga pueden escanear en el juego.',
        'how.step3': 'Cada código cuenta una vez al día y el evento necesita 3 al día. Toca <strong>Empezar escaneos diarios</strong> para ver tus códigos uno a uno; los códigos de más sirven de reserva si alguno no funciona. El progreso se reinicia con el juego a la 1:00 a. m., hora del Pacífico.',
        'how.step4': 'Los códigos QR se actualizan automáticamente cada 10 segundos para seguir siendo válidos en el juego. Toca un código QR para ampliarlo y escanearlo.',
        'how.step5': 'Comparte tus códigos con amigos exportándolos a un archivo .txt o dejando que escaneen tu pantalla.',
        'how.step6': 'Las imágenes QR descargadas incluyen la hora en que se crearon, así que pueden dejar de funcionar al cabo de un tiempo. Descarga una nueva cuando la necesites.',
        'footer.disclaimer': 'Herramienta no oficial hecha por fans. Sin afiliación con Bandai Namco Entertainment. Dragon Ball Legends y los nombres relacionados son marcas comerciales de sus respectivos propietarios.',
        'scanner.retry': 'Volver a activar la cámara',
        'scanner.uploadPrompt': 'O sube una captura de pantalla del código QR:',
        'scanner.tip': 'Consejo: usa la orientación horizontal para las capturas del perfil de jugador',
        'scanner.uploadButton': 'Subir imagen',
        'scanner.prev': 'Espacio anterior',
        'scanner.next': 'Espacio siguiente',
        'scanner.close': 'Cerrar escáner',
        'scanner.title': 'Escanea el código de amigo {slot} de {total}',
        'scanner.titleReplace': 'Escanea el código de amigo {slot} de {total} (reemplaza {code})',
        'scanner.point': 'Apunta la cámara a un código QR',
        'scanner.permissionDenied': 'Error de cámara: permiso denegado',
        'scanner.cameraError': 'Error de cámara: {message}',
        'scanner.unknownError': 'error desconocido',
        'scanner.invalid': 'Formato de código QR no válido. Prueba con otro.',
        'scanner.alreadyScanned': 'Ya escaneaste este código. Prueba con otro.',
        'scanner.alreadyInList': 'Ese código ya está en tu lista. Prueba con otro.',
        'scanner.scannedNext': '¡Código {count} escaneado! Apunta al siguiente código QR.',
        'scanner.imported': '{count} código(s) importado(s)',
        'scanner.allScanned': '¡Los {total} códigos de amigo escaneados!',
        'scanner.importedFull': '{count} código(s) importado(s). Todos los espacios están llenos.',
        'scanner.loadFailed': 'No se pudo cargar el escáner. Revisa tu conexión e inténtalo de nuevo.',
        'scanner.noQrInImage': 'No se encontró ningún código QR en la imagen. Prueba con otra.',
        'daily.title': 'Escaneos diarios',
        'daily.start': 'Empezar escaneos diarios',
        'daily.close': 'Cerrar escaneos diarios',
        'daily.skip': 'Omitir',
        'daily.done': 'Escaneado ✓ Siguiente',
        'daily.progress': 'Escaneados hoy: {count} de {goal}',
        'daily.resetsAt': 'Se reinicia a las {time} (tu hora)',
        'daily.goalReached': '¡Objetivo diario cumplido! Hoy escaneaste {count} códigos. Puedes seguir si quieres.',
        'daily.alreadyScanned': 'Ya escaneado hoy ✓',
        'daily.onlyCode': 'Este es tu único código.',
        'zoom.hint': 'Toca en cualquier lugar para cerrar',
        'consent.label': 'Consentimiento de analítica',
        'consent.text': 'Este sitio usa Google Analytics para entender cómo se utiliza. ¿Permites las cookies de analítica?',
        'consent.decline': 'Rechazar',
        'consent.allow': 'Permitir',
        'toast.downloaded': '¡Descargado!',
        'toast.refreshed': '¡Códigos QR actualizados!',
        'toast.nothingToExport': 'No hay códigos de amigo para exportar',
        'toast.exported': '¡Códigos de amigo exportados!',
        'toast.noValidInFile': 'No se encontraron códigos de amigo válidos en el archivo',
        'toast.uploaded': '¡{count} código(s) cargado(s)!',
        'toast.cleared': '¡Códigos de amigo borrados!',
        'toast.undo': 'Deshacer',
        'toast.restored': 'Códigos de amigo restaurados',
        'qr.sectionTitle': 'Tus códigos QR',
        'card.label': 'Código de amigo {slot}: {code}',
        'card.download': 'Descargar código QR',
        'card.downloadLabel': 'Descargar el código QR del código de amigo {slot}',
        'card.enlargeLabel': 'Ampliar el código QR del código de amigo {slot}',
        'card.markScanned': 'Marcar como escaneado',
        'card.scannedToday': 'Escaneado hoy ✓',
        'input.groupLabel': 'Códigos de amigo',
        'input.placeholder': 'p. ej., ab12cd34',
        'input.label': 'Código de amigo {slot}',
        'input.title': 'Código alfanumérico de 8 caracteres',
        'refresh.countdown': 'Se actualiza en {seconds} s',
    },

    'pt-BR': {
        'page.appName': 'Gerador de QR do Shenron e da Porunga',
        'page.ogTitle': 'Gerador de QR Code do Shenron e da Porunga (Dragon Ball Legends)',
        'page.ogDescription': 'Transforme códigos de amigo em QR Codes escaneáveis para os eventos do Shenron e da Porunga e acompanhe seus 3 escaneamentos diários. Ferramenta não oficial feita por fãs.',
        'page.ogImageAlt': 'Gerador de QR do Shenron e da Porunga: um QR Code ao lado do nome do site',
        'page.title': 'Gerador de QR Shenron e Porunga – Dragon Ball Legends (não oficial)',
        'page.description': 'Gere os QR Codes com marcação de horário para os eventos das Esferas do Dragão do Shenron e da Porunga no Dragon Ball Legends a partir de códigos de amigo e acompanhe seus 3 escaneamentos diários. Ferramenta não oficial feita por fãs.',
        'header.title': 'Gerador de QR do Shenron e da Porunga',
        'header.subtitle': 'Para os eventos das Esferas do Dragão do Dragon Ball Legends · ferramenta não oficial feita por fãs',
        'language.label': 'Idioma',
        'actions.scan': 'Escanear QR Codes',
        'actions.scanDesc': 'Use a câmera ou envie uma captura de tela',
        'actions.export': 'Exportar códigos de amigo',
        'actions.exportDesc': 'Salve os códigos em um arquivo .txt',
        'actions.upload': 'Enviar códigos de amigo',
        'actions.uploadDesc': 'Carregue códigos de um arquivo .txt',
        'actions.refresh': 'Atualizar agora',
        'actions.clear': 'Limpar tudo',
        'empty.intro': 'Nenhum código de amigo adicionado ainda. Para começar:',
        'empty.type': 'Digite códigos de amigo nos campos acima',
        'empty.scan': 'Toque em <strong>Escanear QR Codes</strong> para escanear da tela de um amigo',
        'empty.upload': 'Toque em <strong>Enviar códigos de amigo</strong> para carregar de um arquivo .txt',
        'how.title': 'Como funciona',
        'how.step1': 'Adicione até 6 códigos de amigo digitando, escaneando QR Codes ou enviando um arquivo de texto.',
        'how.step2': 'O app gera um QR Code com marcação de horário para cada código de amigo, que os eventos do Shenron e da Porunga podem escanear no jogo.',
        'how.step3': 'Cada código conta uma vez por dia e o evento precisa de 3 por dia. Toque em <strong>Iniciar escaneamentos diários</strong> para ver seus códigos um de cada vez; os códigos extras servem de reserva se algum não funcionar. O progresso é reiniciado junto com o jogo à 1h da manhã, horário do Pacífico.',
        'how.step4': 'Os QR Codes são atualizados automaticamente a cada 10 segundos para continuarem válidos no jogo. Toque em um QR Code para ampliá-lo e escanear.',
        'how.step5': 'Compartilhe seus códigos com amigos exportando para um arquivo .txt ou deixando que escaneiem sua tela.',
        'how.step6': 'As imagens de QR baixadas contêm o horário em que foram criadas, então podem parar de funcionar depois de um tempo. Baixe uma nova quando precisar.',
        'footer.disclaimer': 'Ferramenta não oficial feita por fãs. Sem afiliação com a Bandai Namco Entertainment. Dragon Ball Legends e os nomes relacionados são marcas registradas de seus respectivos proprietários.',
        'scanner.retry': 'Reativar câmera',
        'scanner.uploadPrompt': 'Ou envie uma captura de tela do QR Code:',
        'scanner.tip': 'Dica: use a orientação paisagem para capturas do perfil do jogador',
        'scanner.uploadButton': 'Enviar imagem',
        'scanner.prev': 'Espaço anterior',
        'scanner.next': 'Próximo espaço',
        'scanner.close': 'Fechar leitor',
        'scanner.title': 'Escaneie o código de amigo {slot} de {total}',
        'scanner.titleReplace': 'Escaneie o código de amigo {slot} de {total} (substitui {code})',
        'scanner.point': 'Aponte a câmera para um QR Code',
        'scanner.permissionDenied': 'Erro da câmera: permissão negada',
        'scanner.cameraError': 'Erro da câmera: {message}',
        'scanner.unknownError': 'erro desconhecido',
        'scanner.invalid': 'Formato de QR Code inválido. Tente outro.',
        'scanner.alreadyScanned': 'Este código já foi escaneado. Tente outro.',
        'scanner.alreadyInList': 'Esse código já está na sua lista. Tente outro.',
        'scanner.scannedNext': 'Código {count} escaneado! Aponte para o próximo QR Code.',
        'scanner.imported': '{count} código(s) importado(s)',
        'scanner.allScanned': 'Todos os {total} códigos de amigo escaneados!',
        'scanner.importedFull': '{count} código(s) importado(s). Todos os espaços estão preenchidos.',
        'scanner.loadFailed': 'Não foi possível carregar o leitor. Verifique sua conexão e tente novamente.',
        'scanner.noQrInImage': 'Nenhum QR Code encontrado na imagem. Tente outra.',
        'daily.title': 'Escaneamentos diários',
        'daily.start': 'Iniciar escaneamentos diários',
        'daily.close': 'Fechar escaneamentos diários',
        'daily.skip': 'Pular',
        'daily.done': 'Escaneado ✓ Próximo',
        'daily.progress': 'Escaneados hoje: {count} de {goal}',
        'daily.resetsAt': 'Reinicia às {time} (seu horário)',
        'daily.goalReached': 'Meta diária concluída! Você escaneou {count} códigos hoje. Pode continuar se quiser.',
        'daily.alreadyScanned': 'Já escaneado hoje ✓',
        'daily.onlyCode': 'Este é o seu único código.',
        'zoom.hint': 'Toque em qualquer lugar para fechar',
        'consent.label': 'Consentimento de análise',
        'consent.text': 'Este site usa o Google Analytics para entender como ele é usado. Permitir cookies de análise?',
        'consent.decline': 'Recusar',
        'consent.allow': 'Permitir',
        'toast.downloaded': 'Baixado!',
        'toast.refreshed': 'QR Codes atualizados!',
        'toast.nothingToExport': 'Nenhum código de amigo para exportar',
        'toast.exported': 'Códigos de amigo exportados!',
        'toast.noValidInFile': 'Nenhum código de amigo válido encontrado no arquivo',
        'toast.uploaded': '{count} código(s) carregado(s)!',
        'toast.cleared': 'Códigos de amigo apagados!',
        'toast.undo': 'Desfazer',
        'toast.restored': 'Códigos de amigo restaurados',
        'qr.sectionTitle': 'Seus QR Codes',
        'card.label': 'Código de amigo {slot}: {code}',
        'card.download': 'Baixar QR Code',
        'card.downloadLabel': 'Baixar o QR Code do código de amigo {slot}',
        'card.enlargeLabel': 'Ampliar o QR Code do código de amigo {slot}',
        'card.markScanned': 'Marcar como escaneado',
        'card.scannedToday': 'Escaneado hoje ✓',
        'input.groupLabel': 'Códigos de amigo',
        'input.placeholder': 'ex.: ab12cd34',
        'input.label': 'Código de amigo {slot}',
        'input.title': 'Código alfanumérico de 8 caracteres',
        'refresh.countdown': 'Atualizando em {seconds}s',
    },
};

function translate(lang, key, params = {}) {
    const table = STRINGS[lang] || STRINGS.en;
    const template = table[key] !== undefined ? table[key] : (STRINGS.en[key] !== undefined ? STRINGS.en[key] : key);
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Saved choice first, then the first supported browser language, else English.
// Any Spanish variant maps to 'es' and any Portuguese variant to 'pt-BR'.
function detectLanguage(saved, browserLanguages) {
    if (LANGUAGES.some(l => l.code === saved)) return saved;
    for (const tag of browserLanguages || []) {
        const base = String(tag).toLowerCase().split('-')[0];
        if (base === 'ja') return 'ja';
        if (base === 'es') return 'es';
        if (base === 'pt') return 'pt-BR';
        if (base === 'en') return 'en';
    }
    return 'en';
}

function languageForPath(pathname) {
    const match = LANGUAGES.find(l => l.path !== '/' && pathname.startsWith(l.path));
    return match ? match.code : 'en';
}

function pathForLanguage(code) {
    const match = LANGUAGES.find(l => l.code === code);
    return match ? match.path : '/';
}

// --- Browser runtime ----------------------------------------------------------

// The page's language is fixed at build time (<html lang>); static text is
// already translated in the HTML. Dynamic text goes through t().
let currentLanguage = 'en';

function t(key, params) {
    return translate(currentLanguage, key, params);
}

// Only the English root page redirects: to the saved language, else to the
// browser's preferred supported language. Language pages never redirect, so
// shared links and search results open as linked. Crawlers use English and
// stay on the root. Runs as soon as this (non-deferred) script loads, before
// the page renders.
function redirectToPreferredLanguage() {
    if (document.documentElement.lang !== 'en') return;
    let saved = null;
    try {
        saved = localStorage.getItem('language');
    } catch (_e) { /* storage unavailable */ }
    const target = detectLanguage(saved, navigator.languages || [navigator.language]);
    if (target !== 'en') {
        window.location.replace(pathForLanguage(target) + window.location.search + window.location.hash);
    }
}

function initI18n() {
    const pageLang = document.documentElement.lang;
    currentLanguage = LANGUAGES.some(l => l.code === pageLang) ? pageLang : 'en';
    const select = document.getElementById('language-select');
    if (select) {
        select.value = currentLanguage;
        select.addEventListener('change', () => {
            try {
                localStorage.setItem('language', select.value);
            } catch (_e) { /* storage unavailable */ }
            window.location.href = pathForLanguage(select.value);
        });
    }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    currentLanguage = LANGUAGES.some(l => l.code === document.documentElement.lang)
        ? document.documentElement.lang
        : 'en';
    redirectToPreferredLanguage();
}

if (typeof module !== 'undefined') {
    module.exports = { STRINGS, LANGUAGES, translate, detectLanguage, languageForPath, pathForLanguage };
}
