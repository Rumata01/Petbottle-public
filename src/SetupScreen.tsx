import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface SetupScreenProps {
    onComplete: (path: string) => Promise<void>;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSelectFolder = async () => {
        setError(null);
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                recursive: true,
            });

            if (selected && typeof selected === 'string') {
                setIsLoading(true);
                try {
                    await onComplete(selected);
                } catch (err) {
                    console.error("Setup completion failed:", err);
                    setError("Klasör doğrulanamadı veya erişim reddedildi. Lütfen başka bir klasör seçin.");
                    setIsLoading(false);
                }
            }
        } catch (err) {
            console.error("Folder selection failed:", err);
            setError("Klasör seçimi sırasında bir hata oluştu.");
            setIsLoading(false);
        }
    };

    return (
        <div className="setup-container" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            padding: '20px'
        }}>
            <div className="setup-card" style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '40px',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-lg)',
                maxWidth: '500px',
                width: '100%',
                textAlign: 'center',
                border: '1px solid var(--border-primary)',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease'
            }}>
                <div style={{
                    fontSize: '64px',
                    marginBottom: '24px',
                    animation: 'float 3s ease-in-out infinite'
                }}>
                    📂
                </div>

                <h1 style={{
                    fontSize: '32px',
                    fontWeight: '700',
                    marginBottom: '12px',
                    background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--text-secondary) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                }}>
                    PetBottle'a Hoşgeldiniz
                </h1>

                <p style={{
                    fontSize: '16px',
                    color: 'var(--text-secondary)',
                    marginBottom: '32px',
                    lineHeight: '1.6'
                }}>
                    Notlarınızı güvenle saklamak ve yönetmek için bir çalışma alanı seçin.
                </p>

                {error && (
                    <div style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '24px',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}>
                        <span>⚠️</span> {error}
                    </div>
                )}

                <button
                    onClick={handleSelectFolder}
                    disabled={isLoading}
                    style={{
                        backgroundColor: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        padding: '16px 32px',
                        fontSize: '16px',
                        fontWeight: '600',
                        border: 'none',
                        borderRadius: 'var(--radius-full)',
                        cursor: isLoading ? 'wait' : 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: 'var(--shadow-md)',
                        width: '100%',
                        opacity: isLoading ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        zIndex: 10,
                        ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties)
                    }}
                    onMouseOver={(e) => {
                        if (!isLoading) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                        }
                    }}
                    onMouseOut={(e) => {
                        if (!isLoading) {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                        }
                    }}
                >
                    {isLoading ? (
                        <>
                            <div style={{
                                width: '20px',
                                height: '20px',
                                border: '2px solid currentColor',
                                borderRightColor: 'transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }} />
                            Çalışma Alanı Hazırlanıyor...
                        </>
                    ) : (
                        <>
                            <span>📁</span> Çalışma Alanı Seç
                        </>
                    )}
                </button>

                <div style={{
                    marginTop: '24px',
                    fontSize: '13px',
                    color: 'var(--text-tertiary)'
                }}>
                    <p>Not: Seçtiğiniz klasör yerel diskinizde saklanır.</p>
                </div>
            </div>

            <style>{`
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
