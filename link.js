"use strict";

// スマホ(送信側)と Quest 表示(受信側)を WebRTC でつなぐ薄いラッパー。
// 接続の仲介(シグナリング)だけ PeerJS の無料ブローカーを使い、
// 実際のデータ(速度の数値のみ)は端末どうしで直接やり取りする。
// ★カメラ映像などの重いデータは一切送らない。送るのは { speed, rpm, sceneId }。
//
// 使い方:
//   const host = VRLink.host({ onData, onStatus });   // Quest 側 → host.code に4桁コード
//   const guest = VRLink.join(code, { onOpen, onStatus, onClose }); // スマホ側 → guest.send(obj)

(function () {
  const PREFIX = "virtualride-";
  const BROKER = { debug: 1 }; // PeerJS 既定の無料クラウドブローカーを使用

  function makeCode() {
    return String(Math.floor(1000 + Math.random() * 9000)); // 4桁
  }

  function ensurePeerLib() {
    if (typeof window.Peer === "undefined") {
      throw new Error("PeerJS が読み込まれていません(ネットワーク接続を確認してください)");
    }
  }

  // Quest 表示側: コードを発行して接続を待ち受ける
  function host({ onData, onStatus, onOpen, onClose } = {}) {
    ensurePeerLib();
    const state = { code: null, peer: null, conn: null };

    function start(attempt = 0) {
      const code = makeCode();
      state.code = code;
      const peer = new window.Peer(PREFIX + code, BROKER);
      state.peer = peer;

      peer.on("open", () => {
        onStatus && onStatus("waiting", code);
        onOpen && onOpen(code);
      });
      peer.on("connection", (conn) => {
        state.conn = conn;
        conn.on("open", () => onStatus && onStatus("connected", code));
        conn.on("data", (data) => onData && onData(data));
        conn.on("close", () => onStatus && onStatus("disconnected", code));
      });
      peer.on("error", (err) => {
        // コードが偶然使われていたら別コードで数回だけ再試行
        if (err && err.type === "unavailable-id" && attempt < 4) {
          peer.destroy();
          start(attempt + 1);
          return;
        }
        onStatus && onStatus("error", err && err.type);
        onClose && onClose(err);
      });
      peer.on("disconnected", () => peer.reconnect());
    }

    start();
    return state;
  }

  // スマホ送信側: コードを指定して接続し、send() で数値を送る
  function join(code, { onOpen, onStatus, onClose } = {}) {
    ensurePeerLib();
    const peer = new window.Peer(BROKER);
    const api = { peer, conn: null, connected: false, send };

    peer.on("open", () => {
      const conn = peer.connect(PREFIX + code, { reliable: false }); // 低遅延優先
      api.conn = conn;
      conn.on("open", () => { api.connected = true; onOpen && onOpen(); onStatus && onStatus("connected"); });
      conn.on("close", () => { api.connected = false; onStatus && onStatus("disconnected"); });
      conn.on("error", (err) => onStatus && onStatus("error", err && err.type));
    });
    peer.on("error", (err) => {
      onStatus && onStatus("error", err && err.type);
      onClose && onClose(err);
    });
    peer.on("disconnected", () => peer.reconnect());

    function send(obj) {
      if (api.conn && api.connected) {
        try { api.conn.send(obj); } catch (_) {}
      }
    }
    return api;
  }

  window.VRLink = { host, join };
})();
