import React, { useState, useRef, useEffect } from 'react';
import { Share2, ShieldAlert, CheckCircle2, Copy, Trash2, Smartphone, Monitor } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as signalR from '@microsoft/signalr';

// Güvenli formatların Hex (Magic Number) başlangıç değerleri
const SAFE_FORMATS: Record<string, string> = {
  "89504E47": "image/png",
  "FFD8FF": "image/jpeg",
  "25504446": "application/pdf",
  "504B0304": "application/zip", // DOCX, XLSX vb. zip tabanlıdır
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB Sınır

export const Paylas: React.FC = () => {
  const [connectionId, setConnectionId] = useState<string>('');
  const [peerId, setPeerId] = useState<string>('');
  const [status, setStatus] = useState<'Boşta' | 'Bağlanıyor' | 'Bağlandı' | 'Hata'>('Boşta');
  const [logs, setLogs] = useState<string[]>([]);
  
  const [receivedFile, setReceivedFile] = useState<{ name: string; size: number; data: Uint8Array | null } | null>(null);
  
  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // WebRTC referansları
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  // Dosya Alım State'leri için Referanslar
  const receivingFileMeta = useRef<{ name: string; size: number; received: number } | null>(null);
  const receivedChunks = useRef<Uint8Array[]>([]);

  // SignalR Bağlantısı referansı
  const hubConnection = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    // Component Unmount olduğunda bağlantıyı temizle
    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (hubConnection.current) {
        hubConnection.current.stop();
      }
    };
  }, []);

  const connectSignalR = async (): Promise<signalR.HubConnection> => {
    if (hubConnection.current?.state === signalR.HubConnectionState.Connected) {
      return hubConnection.current;
    }
    
    // Varsayılan P2P sinyal sunucusu adresi, ortam değişkeninden alınabilir
    const url = import.meta.env.VITE_SIGNALR_URL || 'http://localhost:5000/signalHub';
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect()
      .build();

    conn.on("ReceiveOffer", async (offer, _senderId) => {
       addLog(`Teklif (Offer) alındı...`);
       await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(offer));
       const answer = await peerConnection.current?.createAnswer();
       if (answer) {
         await peerConnection.current?.setLocalDescription(answer);
         await conn.invoke("SendAnswer", peerId, answer);
       }
    });

    conn.on("ReceiveAnswer", async (answer) => {
       addLog(`Cevap (Answer) alındı. Bağlantı kuruluyor...`);
       await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    conn.on("ReceiveIceCandidate", async (candidate) => {
       try {
           if (candidate) {
               await peerConnection.current?.addIceCandidate(new RTCIceCandidate(candidate));
           }
       } catch (err) {
           console.error("ICE adayı eklenemedi:", err);
       }
    });

    await conn.start();
    hubConnection.current = conn;
    return conn;
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => addLog('WebRTC Veri Kanalı Açıldı! Güvenli Aktarım Hazır.');
    channel.onclose = () => {
        addLog('WebRTC Kanalı Kapandı.');
        setStatus('Boşta');
    }
    
    channel.onmessage = (event) => {
      // 1. Durum: Meta Veri (JSON gelirse)
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'file-meta') {
             // DOSYA BOYUT SINIRI KONTROLÜ (SECURITY.MD)
             if (msg.size > MAX_FILE_SIZE) {
                 addLog(`GÜVENLİK İHLALİ: Dosya boyutu limiti aştı! (${msg.size} > ${MAX_FILE_SIZE}). Kanal kapatılıyor.`);
                 channel.close();
                 return;
             }
             receivingFileMeta.current = { name: msg.name, size: msg.size, received: 0 };
             receivedChunks.current = [];
             setReceivedFile({ name: msg.name, size: msg.size, data: null });
             addLog(`Dosya transferi başlatıldı: ${msg.name} (${(msg.size / 1024).toFixed(2)} KB)`);
          }
        } catch (e) {
          console.error("Bilinmeyen mesaj formatı", e);
        }
      } 
      // 2. Durum: Binary Veri (Dosya Parçaları geliyorsa)
      else if (event.data instanceof ArrayBuffer) {
        if (!receivingFileMeta.current) return;
        
        const chunk = new Uint8Array(event.data);

        // İLK CHUNK İÇİN MAGIC NUMBER KONTROLÜ (SECURITY.MD)
        if (receivedChunks.current.length === 0) {
            let hexString = "";
            for (let i = 0; i < Math.min(4, chunk.length); i++) {
                hexString += chunk[i].toString(16).padStart(2, '0').toUpperCase();
            }

            let isSafe = false;
            for (const hex of Object.keys(SAFE_FORMATS)) {
                if (hexString.startsWith(hex)) {
                    isSafe = true;
                    break;
                }
            }

            if (!isSafe) {
                addLog(`GÜVENLİK İHLALİ: Şüpheli dosya tipi tespit edildi (Hex: ${hexString}). Aktarım reddedildi!`);
                channel.close();
                receivingFileMeta.current = null;
                receivedChunks.current = [];
                return;
            }
        }

        // PARÇALARI BİRLEŞTİR
        receivedChunks.current.push(chunk);
        receivingFileMeta.current.received += chunk.byteLength;

        // BUFFER OVERFLOW KORUMASI
        if (receivingFileMeta.current.received > receivingFileMeta.current.size || receivingFileMeta.current.received > MAX_FILE_SIZE) {
             addLog("GÜVENLİK İHLALİ: Beklenenden fazla veri alındı (Overflow). Aktarım iptal edildi!");
             channel.close();
             return;
        }

        // DOSYA TAMAMLANDI MI?
        if (receivingFileMeta.current.received === receivingFileMeta.current.size) {
            addLog(`Dosya başarıyla alındı: ${receivingFileMeta.current.name}. Doğrulanıyor...`);
            
            // Tüm parçaları tek bir diziye birleştir
            const totalLength = receivedChunks.current.reduce((acc, val) => acc + val.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const arr of receivedChunks.current) {
                combined.set(arr, offset);
                offset += arr.length;
            }

            setReceivedFile({
                name: receivingFileMeta.current.name,
                size: receivingFileMeta.current.size,
                data: combined
            });

            // State Sıfırla
            receivingFileMeta.current = null;
            receivedChunks.current = [];
        }
      }
    };
  };

  const handleCreateConnection = async () => {
    setStatus('Bağlanıyor');
    addLog('Yeni bir P2P bağlantı odası oluşturuluyor...');
    
    try {
      const conn = await connectSignalR();
      // Odayı mock ID ile kurmayı dener veya sunucudan alır, uyarlama için mock ID:
      const mockId = Math.random().toString(36).substring(2, 8).toUpperCase();
      try {
        await conn.invoke("CreateRoom", mockId);
      } catch (e) {
        addLog("Uyarı: SignalR CreateRoom çağrısı başarısız, sadece mock kullanılıyor. Sunucu kapalı olabilir." + e);
      }
      setConnectionId(mockId);
      addLog(`Bağlantı oluşturuldu. Oda Kodu: ${mockId}`);

      const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
      peerConnection.current = new RTCPeerConnection(configuration);
      
      dataChannel.current = peerConnection.current.createDataChannel('fileTransfer');
      setupDataChannel(dataChannel.current);

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
           conn.invoke("SendIceCandidate", mockId, event.candidate).catch(console.error);
        }
      };

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      
      try {
         await conn.invoke("SendOffer", mockId, offer);
      } catch (e) { }

      setStatus('Bağlandı'); 
    } catch (err) {
      addLog(`Hata: ${err}`);
      setStatus('Hata');
    }
  };

  const handleJoinConnection = async () => {
    if (!peerId) {
      addLog('Lütfen geçerli bir kod girin.');
      return;
    }
    setStatus('Bağlanıyor');
    addLog(`${peerId} kodlu odaya katılındı...`);
    
    try {
      const conn = await connectSignalR();
      await conn.invoke("JoinRoom", peerId).catch(() => addLog("Uyarı: SignalR JoinRoom başarısız."));

      const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
      peerConnection.current = new RTCPeerConnection(configuration);

      peerConnection.current.ondatachannel = (event) => {
         dataChannel.current = event.channel;
         setupDataChannel(dataChannel.current);
      };

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
           conn.invoke("SendIceCandidate", peerId, event.candidate).catch(console.error);
        }
      };
      
      setStatus('Bağlandı');
    } catch (err) {
      addLog(`Katılma Hatası: ${err}`);
      setStatus('Hata');
    }
  };

  const handleSelectAndSendFile = async () => {
    if (!dataChannel.current || dataChannel.current.readyState !== 'open') {
        addLog('Hata: WebRTC veri kanalı açık (open) değil!');
        return;
    }
    try {
        const selected = await open({ multiple: false });
        if (selected && typeof selected === 'string') {
            const fileName = selected.split(/[/\\]/).pop() || 'dosya';
            addLog(`Dosya okunuyor: ${fileName}`);
            const fileData = await readFile(selected);
            
            if (fileData.byteLength > MAX_FILE_SIZE) {
               addLog(`GÜVENLİK İHLALİ: Dosya boyutu çok büyük, sınır 100MB! (${(fileData.byteLength / 1024 / 1024).toFixed(2)} MB)`);
               return;
            }

            // 1. Meta Veri Gönder
            const meta = { type: 'file-meta', name: fileName, size: fileData.byteLength };
            dataChannel.current.send(JSON.stringify(meta));
            
            // 2. CHUNKING - Parçalara Böldürerek Gönder
            const CHUNK_SIZE = 64 * 1024; // 64 KB Architecture Guide
            let offset = 0;
            addLog(`Transfer başlatılıyor...`);

            const sendChunks = async () => {
                while (offset < fileData.byteLength) {
                    if (dataChannel.current && dataChannel.current.readyState === 'open') {
                        const chunk = fileData.slice(offset, offset + CHUNK_SIZE);
                        dataChannel.current.send(chunk);
                        offset += CHUNK_SIZE;

                        // BufferedAmount engelleme mekanizması
                        if (dataChannel.current.bufferedAmount > 2 * 1024 * 1024) { // Eğer bufferda 2MB veri varsa bekle
                           await new Promise(r => {
                              const check = setInterval(() => {
                                 if (dataChannel.current && dataChannel.current.bufferedAmount < 1024 * 1024) {
                                    clearInterval(check);
                                    r(null);
                                 }
                              }, 20);
                           });
                        }
                    } else {
                        addLog('Bağlantı koptu, transfer iptal ediliyor.');
                        break;
                    }
                }
                if (offset >= fileData.byteLength) addLog(`Transfer başarıyla tamamlandı: ${fileName}`);
            };
            
            sendChunks();
        }
    } catch (err) {
        addLog(`Dosya okuma veya gönderme hatası: ${err}`);
    }
  };

  const handleSaveFile = async () => {
    if (!receivedFile || !receivedFile.data) return;
    try {
        const filePath = await save({
            defaultPath: receivedFile.name,
        });

        if (filePath) {
            await writeFile(filePath, receivedFile.data);
            addLog(`Güvenli indirme başarılı: ${filePath}`);
            setReceivedFile(null); // Temizle
        }
    } catch (error) {
        addLog(`İndirme Hatası: ${error}`);
    }
  };

  return (
    <div className="flex-col" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: 'var(--space-6)' }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '2rem' }}>
        <Share2 size={32} color="var(--brand-main)" /> 
        P2P Secure Share (WebRTC)
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-8)' }}>
        Cihazlar arası uçtan uca şifreli ve güvenli dosya transferi.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        
        {/* Oda Oluştur Kartı */}
        <div style={{ backgroundColor: 'var(--bg-panel)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={20} /> Gönderici Ol
            </h3>
            <p className="text-sm text-muted">Dosya göndermek için yeni bir güvenli tünel başlatın.</p>
            
            {connectionId ? (
                <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '4px', color: 'var(--brand-main)' }}>{connectionId}</div>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-2)' }} onClick={() => navigator.clipboard.writeText(connectionId)}>
                        <Copy size={14} /> Kodu Kopyala
                    </button>
                    {status === 'Bağlandı' && (
                        <div style={{ marginTop: 'var(--space-4)' }}>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSelectAndSendFile}>
                                Dosya Seç ve Gönder
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={handleCreateConnection} disabled={status !== 'Boşta'}>
                    Bağlantı Odası Oluştur
                </button>
            )}
        </div>

        {/* Odaya Katıl Kartı */}
        <div style={{ backgroundColor: 'var(--bg-panel)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={20} /> Alıcı Ol
            </h3>
            <p className="text-sm text-muted">Size verilen 6 haneli kod ile güvenli tünele katılın.</p>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-4)' }}>
                <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Oda Kodunu Girin (örn: A1B2C3)" 
                    value={peerId}
                    onChange={(e) => setPeerId(e.target.value.toUpperCase())}
                    maxLength={6}
                    disabled={status !== 'Boşta'}
                />
                <button className="btn btn-secondary" onClick={handleJoinConnection} disabled={status !== 'Boşta' || peerId.length < 5}>
                    Katıl
                </button>
            </div>
        </div>

      </div>

      {/* Durum Göstergeleri */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-6)' }}>
         <div style={{ 
            width: '12px', height: '12px', borderRadius: '50%',
            backgroundColor: status === 'Bağlandı' ? 'var(--success)' : status === 'Bağlanıyor' ? 'var(--warning)' : 'var(--text-muted)'
         }}></div>
         <span style={{ fontWeight: '500' }}>Durum: {status}</span>
      </div>

       {/* Dosya Alma Alanı */}
       {receivedFile && receivedFile.data && (
        <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--success, #10b981)', color: 'white', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 />
                <div>
                    <strong>{receivedFile.name}</strong> başarıyla alındı ve güvenlikten geçti. <br/>
                    <small>{(receivedFile.size / 1024 / 1024).toFixed(2)} MB</small>
                </div>
            </div>
            <button className="btn" style={{ backgroundColor: 'white', color: 'var(--success, #10b981)' }} onClick={handleSaveFile}>
                Cihaza Kaydet
            </button>
        </div>
      )}

      {/* Log Ekranı */}
      <div style={{ backgroundColor: 'black', color: '#00ff00', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.85rem', height: '200px', overflowY: 'auto' }}>
        <div style={{ color: 'white', borderBottom: '1px solid #333', paddingBottom: '4px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span><ShieldAlert size={14} style={{ display: 'inline', marginRight: '4px' }}/> Güvenlik Duvarı Aktif - WebRTC Tüneli İzleniyor</span>
            <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setLogs([])}><Trash2 size={14} /> Temizle</span>
        </div>
        {logs.length === 0 ? <span style={{ opacity: 0.5 }}>Bekleniyor...</span> : logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>

    </div>
  );
};
