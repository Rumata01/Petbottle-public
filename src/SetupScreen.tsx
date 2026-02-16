import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface SetupScreenProps {
    onComplete: (path: string) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
    const [error, setError] = useState<string | null>(null);

    const handleSelectFolder = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                recursive: true,
            });

            if (selected && typeof selected === 'string') {
                onComplete(selected);
            } else if (selected === null) {
                // User cancelled
            }
        } catch (err) {
            console.error("Folder selection failed:", err);
            setError("Klasör seçimi başarısız oldu. Lütfen tekrar deneyin.");
        }
    };

    return (
        <div className="setup-container">
            <div className="setup-card">
                <div className="setup-icon">📂</div>
                <h1>PetBottle'a Hoşgeldiniz</h1>
                <p>
                    Başlamak için lütfen çalışmalarınızı kaydedeceğiniz bir klasör seçin.
                </p>

                <button className="setup-button" onClick={handleSelectFolder}>
                    Çalışma Alanı Seç
                </button>

                {error && <div className="setup-error">{error}</div>}

                <div className="setup-footer">
                    <p className="setup-hint">
                        Not: İleride bu klasörü değiştirebilirsiniz.
                    </p>
                </div>
            </div>
        </div>
    );
};
