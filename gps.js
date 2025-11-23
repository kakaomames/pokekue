(function (Scratch) {
    "use strict";

    // ===============================================
    // グローバル変数と初期設定
    // ===============================================

    // 最後に取得した位置情報を格納するオブジェクト
    let lastKnownPosition = { latitude: 0, longitude: 0, timestamp: 0 };
    // Iframe要素とオーバーレイ要素
    /** @type {HTMLIFrameElement|null} */
    let iframe = null;
    let overlay = null;
    let x = 0;
    let y = 0;
    let width = 480; // マップの横幅
    let height = 360; // マップの高さ
    const SANDBOX = ["allow-scripts", "allow-forms", "allow-modals", "allow-popups", "allow-same-origin"];

    // ===============================================
    // Iframeヘルパー関数 (マップ表示・更新)
    // ===============================================

    /**
     * Iframeの位置とサイズをステージに合わせて更新します。
     */
    const updateFrameAttributes = () => {
        if (!iframe) return;
        
        // Iframeをステージの上に重ねて表示するための座標変換ロジック
        // Scratchステージの中央 (0, 0) を基準に位置を調整
        iframe.style.width = `${width}px`;
        iframe.style.height = `${height}px`;
        iframe.style.transform = `translate(${-width / 2 + x}px, ${-height / 2 - y}px)`;
        iframe.style.top = "0";
        iframe.style.left = "0";
    };

    /**
     * Iframeを新規作成し、ステージ上に表示します。
     * @param {string} src - Iframeに読み込むURL
     */
    const createAndDisplayFrame = (src) => {
        // 既存のiframeがあれば削除 (新規作成時のみ)
        if (iframe) closeFrame();

        iframe = document.createElement("iframe");
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.style.position = "absolute";
        iframe.setAttribute("sandbox", SANDBOX.join(" "));
        iframe.setAttribute("src", src);
        
        // Scratchの描画エンジンを使ってステージの上に重ねる
        overlay = Scratch.renderer.addOverlay(iframe, "scale-centered");
        updateFrameAttributes();
    };

    /**
     * Iframeを閉じます。
     */
    const closeFrame = () => {
        if (iframe) {
            Scratch.renderer.removeOverlay(iframe);
            iframe = null;
            overlay = null;
        }
    };
    
    // ステージサイズ変更時にIframeの位置を自動調整
    Scratch.vm.on("STAGE_SIZE_CHANGED", updateFrameAttributes);
    // プロジェクト停止時にIframeを閉じる
    Scratch.vm.runtime.on("RUNTIME_DISPOSED", closeFrame);

    /**
     * 指定された座標を中心とするOpenStreetMapを表示または更新します。
     * @param {number} lat - 緯度
     * @param {number} lon - 経度
     */
    const displayMap = function(lat, lon) {
        if (lat === 0 && lon === 0) {
            console.error("[MAP] 緯度・経度が不正なためマップを表示できません。");
            return;
        }

        // OpenStreetMapの埋め込みURLを生成 (ズームレベル15, ±0.01度の範囲)
        const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lon}`;
        console.log(`[MAP] Generated URL: ${mapUrl}`);

        // 💡 既存の iframe があるかチェック
        if (iframe) {
            // 既に開いている場合は URL (src) のみを更新し、再読み込みを防ぐ
            if (iframe.src !== mapUrl) {
                iframe.src = mapUrl; 
                console.log("[MAP] Map URL updated.");
            }
        } else {
            // 存在しない場合のみ新規作成
            createAndDisplayFrame(mapUrl);
        }
    };

    // ===============================================
    // GPS監視関数
    // ===============================================

    /**
     * 💡 watchPosition() を使ってGPSの継続的な監視を開始します。
     * 移動があった際に、lastKnownPositionが自動で更新されます。
     */
    const startWatchingPosition = function() {
        if (!navigator.geolocation) {
            console.log("[GPS] Geolocation not supported");
            return; 
        }

        const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

        navigator.geolocation.watchPosition(
            (position) => {
                // 成功時に値を更新 (移動するたびにこのブロックが呼び出される)
                lastKnownPosition.latitude = position.coords.latitude;
                lastKnownPosition.longitude = position.coords.longitude;
                lastKnownPosition.timestamp = Date.now();
                console.log(`[GPS] Position auto-updated: Lat=${lastKnownPosition.latitude}, Lon=${lastKnownPosition.longitude}`);
            },
            (err) => {
                console.error(`[GPS ERROR] GPS監視エラー (${err.code}): ${err.message}`);
            },
            options
        );
    };

    // 拡張機能のロード時に監視を自動で開始
    startWatchingPosition(); 

    // ===============================================
    // 拡張機能の本体クラス
    // ===============================================

    class GPSMapExtension {
        getInfo() {
            return {
                id: 'kakaomameGPSIframe', 
                name: '🗺️ GPS & マップ (統合)',
                color1: '#0070c7', 
                color2: '#005a9f', 
                blocks: [
                    { opcode: 'getLatitude', blockType: Scratch.BlockType.REPORTER, text: '現在の緯度', },
                    { opcode: 'getLongitude', blockType: Scratch.BlockType.REPORTER, text: '現在の経度', },
                    { opcode: 'getTimestamp', blockType: Scratch.BlockType.REPORTER, text: '最終取得時刻 (ミリ秒)', },
                    "---",
                    { opcode: 'isGPSSupported', blockType: Scratch.BlockType.BOOLEAN, text: 'このデバイスはGPSに対応している', },
                    "---",
                    { 
                        opcode: 'showCurrentMap', 
                        blockType: Scratch.BlockType.COMMAND, 
                        text: '現在地のマップを表示',
                    },
                    {
                        opcode: 'showMapWithCoords',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '[LAT] 緯度 [LON] 経度のマップを表示',
                        arguments: {
                            LAT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 35.681236 },
                            LON: { type: Scratch.ArgumentType.NUMBER, defaultValue: 139.767125 }
                        }
                    },
                    {
                        opcode: 'hideMap',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'マップを隠す',
                    },
                ],
                menus: {}
            };
        }

        // --- GPS取得 ---
        
        getLatitude() {
            // watchPositionが自動で更新するため、awaitは不要
            return lastKnownPosition.latitude;
        }

        getLongitude() {
            // watchPositionが自動で更新するため、awaitは不要
            return lastKnownPosition.longitude;
        }

        getTimestamp() {
            return lastKnownPosition.timestamp;
        }

        isGPSSupported() {
            return !!navigator.geolocation;
        }
        
        // --- マップ表示 ---

        /**
         * 現在地を取得し、その座標を中心とするOpenStreetMapを表示/更新します。
         */
        showCurrentMap() {
            console.log("[BLOCK] showCurrentMap:Called");
            
            const lat = lastKnownPosition.latitude;
            const lon = lastKnownPosition.longitude;

            displayMap(lat, lon);
        }

        /**
         * 引数で渡された座標を中心とするOpenStreetMapを表示/更新します。
         */
        showMapWithCoords(args) {
            console.log("[BLOCK] showMapWithCoords:Called");
            
            const lat = Scratch.Cast.toNumber(args.LAT);
            const lon = Scratch.Cast.toNumber(args.LON);

            displayMap(lat, lon);
        }
        
        /**
         * マップを閉じます。
         */
        hideMap() {
            closeFrame();
        }
    }

    Scratch.extensions.register(new GPSMapExtension());
    console.log("[REGISTER] Extension successfully registered.");

})(Scratch);
