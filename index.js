const { Server, ServerEvent } = require('socket-be');
const WebSocket = require('ws');
const fetch = require('node-fetch'); // HTTPリクエスト用
const wanakana = require('wanakana');
const fs = require('fs');
const JSON5 = require('json5');

// --- グローバル変数定義 ---
const configPath = './config.json';
let configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON5.parse(configFile);
let { app_id, secret_key, username, sub_domain, proximity, spectator, password, distance, port, web_port, lang } = config;

let stop_roop = false;
let passwords = {};
let positions = {};
let shouldBroadcast = false;

// ★★★ 新しいグローバル変数 ★★★
let relayWs; // 外部リレーサーバーへのWebSocket接続インスタンス
let mainWorld; // 現在のworldオブジェクトを保持
let localTcpClient;   // socket-beへのローカルTCP接続用

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★★★ あなたのGlitchサーバーのドメイン名に書き換えてください ★★★
const RELAY_SERVER_DOMAIN = 'mcproxvc.tcpexposer.com';
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★


// ★★★ ローカルWebSocketサーバーのコードは完全に削除 ★★★
// const wss = new WebSocket.Server({ port: web_port }); ... の部分は不要


// ★★★ データをリレーサーバーに送信するよう変更 ★★★
function broadcastPositions() {
  // relayWs が接続済みの場合のみ送信
  if (relayWs && relayWs.readyState === WebSocket.OPEN) {
    const dataToSend = JSON.stringify({
      type: 'world_update', // メッセージの種別を定義
      payload: { // 実際のデータ
        positions,
        distance,
        password,
        passwords,
        app_id,
        secret_key,
      }
    });
    relayWs.send(dataToSend);
  }
}

// 既存の関数 (sendtell, processName) は変更なし
async function sendtell(world) {
  await world.runCommand(`tellraw @a {"rawtext":[{"text":"§e【運営】§b近接VC（しゃべくら）中Discordの「近接VCの使い方」をよく読んで参加してね！"}]}`);
  setTimeout(() => sendtell(world), 300000);
}
function processName(name) {
  const vcname1 = name.replace(/ /g, "_");
  const senderName = wanakana.toRomaji(vcname1);
  return senderName.replace(/n'/g, "n");
}


// 既存の関数 (handleWorld) は変更なし
async function handleWorld(world) {
  try {
    const playersMap = world.players;
    const playerNames = Array.from(playersMap.values()).map(player => String(player.name));

    if (proximity) {
      const [notDeathCmdResult, spectatorsCmdResult, queryTargetCmdResult] = await Promise.all([
        world.runCommand(`testfor @e[type=player]`),
        world.runCommand(`testfor @a[m=spectator]`),
        world.runCommand(`querytarget @a`)
      ]);
      const alivePlayerNames = notDeathCmdResult.victim || [];
      const spectatorPlayerNames = spectatorsCmdResult.victim || [];
      const queryTargetDetailsString = queryTargetCmdResult.details || "[]";
      const parsedPlayerInfoArray = JSON.parse(queryTargetDetailsString);

      playerNames.forEach((playerName, index) => {
        const processedName = processName(playerName);
        if (!alivePlayerNames.includes(playerName)) {
          positions[processedName] = { x: 0, y: 20000, z: 0 };
        } else if (spectator && spectatorPlayerNames.includes(playerName)) {
          positions[processedName] = { x: 0, y: 10000, z: 0 };
        } else if (parsedPlayerInfoArray[index] && parsedPlayerInfoArray[index].position) {
          const position = parsedPlayerInfoArray[index].position;
          positions[processedName] = { x: position.x, y: position.y, z: position.z };
        } else {
          console.warn(`Player ${playerName} (index ${index}) is alive and not spectator, but position data is missing or invalid. Defaulting.`);
          positions[processedName] = { x: 0, y: 30000, z: 0 };
        }
      });
      shouldBroadcast = true;
    } else {
      playerNames.forEach(playerName => {
        positions[processName(playerName)] = { x: 0, y: 10000, z: 0 };
      });
      shouldBroadcast = true;
    }
  } catch (error) {
    console.error('Error handling world:', error);
  }
  if (!stop_roop) {
    // requestAnimationFrameの代わりにsetTimeoutを使用
    setTimeout(() => handleWorld(world), 100);
  }
}

// 既存の関数 (server_log_info, server_log_log) は変更なし
function server_log_info(message) {
  console.log("\x1b[36m[Info]\x1b[0m " + message);
}
function server_log_log(message) {
  console.log("\x1b[33m[Log]\x1b[0m " + message);
}

// 既存の関数 (periodicBroadcast) は変更なし
function periodicBroadcast() {
  if (shouldBroadcast) {
    broadcastPositions();
    shouldBroadcast = false;
  }
  setTimeout(periodicBroadcast, 50);
}

const server = new Server({
  port: port,
  disableEncryption: true,
  timezone: 'Asia/Tokyo'
});

server.on(ServerEvent.PlayerChat, async ev => {
  const { sender, message, world } = ev;
  if (message === "!test") {
    const playersMap = world.players
    const players = Array.from(playersMap.values()).map(player => player.name);
    console.log(Array.from(playersMap.values()).map(player => player));
  }
  if (message.startsWith('!dis ')) {
    dis = message.split(' ');
    if (!isNaN(dis[1])) {
      const host = world.localPlayer.name;
      if (sender.name == host) {
        distance = Number(dis[1]);
        configFile = configFile.replace(/"distance":\s*[\d.]+/, `"distance": ${distance}`);
        fs.writeFileSync(configPath, configFile, 'utf8');
        if (lang == "ja") {
          await world.runCommand(`tellraw @a {"rawtext":[{"text":"声の最大距離を${distance}に変更しました"}]}`);
        } else {
          await world.runCommand(`tellraw @a {"rawtext":[{"text":"Changed max distance to ${distance}"}]}`);
        }
      }
    }
    console.log("distance = " + distance);

  }
  else if (message === '!name') {
    const vcname1 = sender.name.replace(/ /g, "_");
    senderName = wanakana.toRomaji(vcname1);
    let vcname = senderName.replace(/n'/g, "n");
    console.log(vcname);
    if (lang == "ja") {
      await world.runCommand(`tellraw "${sender.name}" {"rawtext":[{"text":"ルームIDは${sub_domain}です\nあなたのVCnameは${vcname}です"}]}`);
    } else {
      await world.runCommand(`tellraw "${sender.name}" {"rawtext":[{"text":"RoomID is ${sub_domain}\nYour VCname is ${vcname}"}]}`);
    }
    if (password) {
      if (!passwords[vcname]) {
        let otp = '';
        const characters = '0123456789';
        for (let i = 0; i < 4; i++) {
          const randomIndex = Math.floor(Math.random() * characters.length);
          otp += characters[randomIndex];
        }
        passwords[vcname] = otp;
      }
      if (lang == "ja") {
        await world.runCommand(`tellraw "${sender.name}" {"rawtext":[{"text":"パスワードは${passwords[vcname]}です"}]}`);
      } else {
        await world.runCommand(`tellraw "${sender.name}" {"rawtext":[{"text":"Password is ${passwords[vcname]}"}]}`);
      }
    }
  } else if (message === '!password true') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      password = true
      configFile = configFile.replace(/"password": false/, `"password": true`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      if (lang == "ja") {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"パスワードを有効にしました"}]}`);
      } else {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"Password enabled"}]}`);
      }
    }
  } else if (message === '!password false') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      password = false
      configFile = configFile.replace(/"password": true/, `"password": false`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      if (lang == "ja") {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"パスワードを無効にしました"}]}`);
      } else {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"Password disabled"}]}`);
      }
    }
  } else if (message === '!pvc true') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      proximity = true
      configFile = configFile.replace(/"proximity": false/, `"proximity": true`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      if (lang == "ja") {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"近接vcを有効にしました"}]}`);
      } else {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"proximity voice chat enabled"}]}`);
      }
    }
  } else if (message === '!pvc false') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      proximity = false
      configFile = configFile.replace(/"proximity": true/, `"proximity": false`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      if (lang == "ja") {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"近接vcを無効にしました"}]}`);
      } else {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"proximity voice chat disabled"}]}`);
      }
    }
  } else if (message === '!spectator true') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      proximity = true
      configFile = configFile.replace(/"spectator": false/, `"spectator": true`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      if (lang == "ja") {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"スペクテイターとVCを分けました"}]}`);
      } else {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"Spectator and VC separated"}]}`);
      }
    }
  } else if (message === '!spectator false') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      proximity = false
      configFile = configFile.replace(/"spectator": true/, `"spectator": false`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      if (lang == "ja") {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"スペクテイターを共通のVCにしました"}]}`);
      } else {
        await world.runCommand(`tellraw @a {"rawtext":[{"text":"Spectator set to common VC"}]}`);
      }
    }
  } else if (message === '!lang ja') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      lang = "ja"
      configFile = configFile.replace(/"lang": "en"/, `"lang": "ja"`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      await world.runCommand(`tellraw @a {"rawtext":[{"text":"<近接VC>言語を日本語に設定しました"}]}`);
    }
  } else if (message === '!lang en') {
    const host = world.localPlayer.name;
    if (sender.name == host) {
      lang = "en"
      configFile = configFile.replace(/"lang": "ja"/, `"lang": "en"`);
      fs.writeFileSync(configPath, configFile, 'utf8');
      await world.runCommand(`tellraw @a {"rawtext":[{"text":"<Proximity VC>Language set to English"}]}`);
    }
  } else if (message === '!help') {
    await world.runCommand(`tellraw ${sender.name} {"rawtext":[{"text":"--------------------"}]}`);
    if (lang == "ja") {
      await world.runCommand(`tellraw ${sender.name} {"rawtext":[{"text":"コマンド一覧：\n  !help - ヘルプを表示します\n  !name - VCで使う名前を確認できます"}]}`);
      const host = world.localPlayer.name;
      if (sender.name == host) {
        await world.runCommand(`tellraw ${sender.name} {"rawtext":[{"text":"ホスト専用コマンド：\n  !lang - !lang <ja/en> chenge language\n  !dis - !dis <数値> で声の届く距離を変更できます\n  !pvc - !pvc <true/false> で近接vcを有効/無効にできます\n  !spectator - !spectator <true/false> でスペクテイターとVCを分けます\n  !password - !password <true/false> でパスワードを有効/無効にできます"}]}`);
      }
    } else {
      await world.runCommand(`tellraw ${sender.name} {"rawtext":[{"text":"Command list:\n  !help - show help\n  !name - check your VC name"}]}`);
      const host = world.localPlayer.name;
      if (sender.name == host) {
        await world.runCommand(`tellraw ${sender.name} {"rawtext":[{"text":"Host-only command：\n  !lang - !lang <ja/en> 言語を変更できます\n  !dis - !dis <Number> set max distance\n  !pvc - !pvc <true/false> enable/disable proximity voice chat\n  !spectator - !spectator <true/false> separate spectator and VC\n  !password - !password <true/false> enable/disable password"}]}`);
      }
    }
    await world.runCommand(`tellraw ${sender.name} {"rawtext":[{"text":"--------------------"}]}`);
  }
});

server.on(ServerEvent.Open, () => {
  server_log_info(`Minecraft: "/connect localhost:${port}" で接続します`)
  server_log_log("open");
});

server.on(ServerEvent.WorldAdd, async (ev) => {
  const { world } = ev;
  server_log_info(`connection opened: ${world.name}`);
  if (lang == "ja") {
    let vc = "";
    proximity ? vc = '有効' : vc = '無効';
    world.sendMessage(`接続を開始しました\n近接vc：${vc}\n声の届く距離：${distance}\n!help でコマンド一覧を確認できます`);
  } else {
    let vc = "";
    proximity ? vc = 'enabled' : vc = 'disabled';
    world.sendMessage(`Connection started\nProximity voice chat:${vc}\nMax distance:${distance}\n!help for command list`);
  }
  const host = await world.getLocalPlayer();
  await handleWorld(world);
});

server.on(ServerEvent.WorldRemove, (ev) => {
  const { world } = ev;
  stop_roop = true;
  server_log_info(`connection closed: ${world.name}`);
});

server.on(ServerEvent.PlayerJoin, (ev) => {
  const { player } = ev;
  server_log_info(`Joined: ${player.name}`);
});

server.on(ServerEvent.PlayerLeave, async (ev) => {
  const { player } = ev;
  server_log_info(`Left: ${player.name}`);
  positions[player.name] = { x: 0, y: 10000, z: 0 };
});

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★★★ ここからが新しく追加された、リレーサーバーに接続する処理 ★★★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

async function connectToRelayServer() {
  console.log('中継サーバーに新しいルームの作成をリクエストします...');

  try {
    // 1. HTTPリクエストでルームIDを取得
    const response = await fetch(`https://${RELAY_SERVER_DOMAIN}/create-room`);
    if (!response.ok) throw new Error(`サーバーエラー: ${response.statusText}`);
    const data = await response.json();
    const roomId = data.roomId;

    // 2. 取得したルームIDをユーザーに分かりやすく表示
    console.log("\n=======================================================");
    console.log(`ROOM ID: ${roomId}`);
    console.log("参加者はこのURLにアクセスしてください");
    console.log("Participants should access this URL")
    console.log("https://proximity-vc-mcbe.pages.dev?roomid=" + roomId);
    console.log("=======================================================\n");

    // 3. WebSocketでサーバーに接続
    const wsUrl = `wss://${RELAY_SERVER_DOMAIN}/room/${roomId}?clientType=binder_script`;
    relayWs = new WebSocket(wsUrl); // グローバル変数に接続を保存

    relayWs.on('open', () => {
      console.log('中継サーバーに接続しました。ブラウザからの指示を待っています...');
    });

    relayWs.on('message', async (message) => {
      const msgString = message.toString();
      console.log(`ブラウザからメッセージを受信: ${msgString}`);

      try {
        const command = JSON.parse(msgString);
        // mainWorld が存在する場合のみコマンドを実行
        if (mainWorld && command.action === 'run_command' && typeof command.value === 'string') {
          console.log(`Minecraftコマンドを実行します: ${command.value}`);
          const result = await mainWorld.runCommand(command.value);
          // 実行結果をブラウザに送り返す
          relayWs.send(JSON.stringify({ type: 'command_result', payload: result }));
        }
      } catch (e) {
        console.error('受信したメッセージの解析またはコマンド実行に失敗:', e);
      }
    });

    relayWs.on('close', () => console.log('中継サーバーとの接続が切れました。'));
    relayWs.on('error', (error) => console.error('WebSocketエラー:', error));

  } catch (error) {
    console.error('ルームの作成または接続に失敗しました:', error);
  }
}

// connectMcToServerRelay 関数をこれに置き換えてください

async function connectMcToServerRelay() {
  console.log('[MC Relay] Minecraft接続用の中継サーバーにルーム作成をリクエストします...');
  try {
    // 1. ルームIDを取得
    const response = await fetch(`https://${RELAY_SERVER_DOMAIN}/create-room`);
    const data = await response.json();
    const mcRoomId = data.roomId;

    // 2. 接続情報を表示
    console.log("\n=======================================================");
    console.log("Minecraftから以下のコマンドで接続してください:");
    console.log("Connect from Minecraft with the following command:")
    console.log(`/connect ${RELAY_SERVER_DOMAIN}/room/${mcRoomId}`); // パス形式のURL
    console.log("=======================================================\n");

    // 3. ★★★ 自分が'binder_script'であることをクエリパラメータで伝える ★★★
    const relayUrl = `wss://${RELAY_SERVER_DOMAIN}/room/${mcRoomId}?clientType=binder_script`;
    const mcRelayWs = new WebSocket(relayUrl);

    mcRelayWs.on('open', () => {
      console.log(`[MC Relay] 中継サーバーに接続完了(ID: ${mcRoomId})。パートナー(Minecraft)の参加を待っています...`);
    });

    mcRelayWs.on('message', (message) => {
      // 4. ★★★ メッセージを判別するロジック ★★★
      try {
        const command = JSON.parse(message.toString());
        // パートナー接続通知を受け取ったら、ブリッジ構築を開始
        if (command.type === 'partner_connected') {
          console.log('★★★ [MC Relay] パートナー接続通知を受信。ローカルブリッジを構築します。 ★★★');

          // この接続をグローバルに保存して、ブリッジ関数が使えるようにする
          // (もしmcRelayWsをグローバル変数にしている場合は不要)
          const bridgeRelayWs = mcRelayWs;

          // ブリッジ用のローカルWebSocketクライアントを作成
          const localWsToBe = new WebSocket(`ws://127.0.0.1:${port}`);
          localTcpClient = localWsToBe; // グローバル変数に保存

          localWsToBe.on('open', () => console.log('[MC Relay] ローカルのsocket-beに接続成功。'));

          // B) socket-beからの返信をリレーに流す
          localWsToBe.on('message', (returnData) => {
            if (bridgeRelayWs.readyState === WebSocket.OPEN) bridgeRelayWs.send(returnData);
          });

          localWsToBe.on('error', (err) => console.error('[MC Local WS Error]', err.message));
          localWsToBe.on('close', () => {
            if (bridgeRelayWs.readyState === WebSocket.OPEN) bridgeRelayWs.close();
          });
          return; // 通知メッセージの処理はここまで
        }
      } catch (e) {
        // JSONでなければゲームデータと判断
      }

      // 5. ゲームデータは、確立済みのブリッジに流す
      if (localTcpClient && localTcpClient.readyState === WebSocket.OPEN) {
        localTcpClient.send(message);
      }
    });

    mcRelayWs.on('close', () => {
      console.log('[MC Relay] 中継サーバーとの接続が切れました。');
      if (localTcpClient) localTcpClient.close();
    });
    mcRelayWs.on('error', (err) => console.error('[MC Relay] WebSocketエラー:', err));

  } catch (error) {
    console.error('[MC] 処理中にエラーが発生しました:', error);
  }
}

// --- すべての処理を開始 ---
periodicBroadcast(); // 定期ブロードキャストを開始
connectMcToServerRelay()
connectToRelayServer(); // リレーサーバーへの接続を開始
