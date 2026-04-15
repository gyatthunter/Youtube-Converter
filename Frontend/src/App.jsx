import React, { useState, useEffect, useRef } from 'react';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const Navbar = ({ setTheme }) => (
  <nav className="navbar runes-navbar">
    <div className="runes-header">
      <span className="interactive-rune" onClick={() => setTheme('mando')}>DARK</span>
      <span className="interactive-rune" onClick={() => setTheme('jedi')}>JEDI</span>
      <span className="interactive-rune" onClick={() => setTheme('sith')}>SITH</span>
    </div>
  </nav>
);

const VaderHilt = () => (
  <div className="custom-hilt hilt-vader">
    <div className="vader-pommel"></div>
    <div className="vader-grip">
      {[1, 2, 3].map(i => <div key={i} className="vader-ridge"></div>)}
    </div>
    <div className="vader-shroud"></div>
    <div className="vader-emitter"></div>
  </div>
);

const AnakinHilt = () => (
  <div className="custom-hilt hilt-anakin">
    <div className="anakin-pommel"></div>
    <div className="anakin-grip">
      <div className="anakin-control-box">
        <div className="anakin-button"></div>
        <div className="anakin-button-gold"></div>
      </div>
    </div>
    <div className="anakin-emitter">
      <div className="anakin-shroud"></div>
    </div>
  </div>
);

const YodaHilt = () => (
  <div className="custom-hilt hilt-yoda">
    <div className="yoda-pommel"></div>
    <div className="yoda-grip">
      <div className="yoda-ridge yoda-ridge-1"></div>
      <div className="yoda-ridge yoda-ridge-2"></div>
    </div>
    <div className="yoda-emitter"></div>
  </div>
);

const DarksaberHilt = () => (
  <div className="custom-hilt hilt-darksaber">
    <div className="darksaber-pommel"></div>
    <div className="darksaber-grip"></div>
    <div className="darksaber-guard"></div>
    <div className="darksaber-emitter"></div>
  </div>
);

const LightsaberInput = ({ theme, query, setQuery }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const inputRef = useRef(null);

  const handleDownload = async () => {
    if (!query) { alert("Enter a link"); return; }

    setIsDownloading(true);
    setProgress(0);
    setDownloadStatus("STARTING...");

    // Step 1: Start conversion
    const startRes = await fetch(`${API_BASE}/convert?url=${encodeURIComponent(query)}`);
    if (!startRes.ok) {
      alert("Failed to start conversion");
      setIsDownloading(false);
      return;
    }
    const { jobId } = await startRes.json();
    setDownloadStatus("CONVERTING...");

    // Step 2: Poll progress
    try {
      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          const pres = await fetch(`${API_BASE}/progress?jobId=${jobId}`);
          const data = await pres.json();
          setProgress(data.progress || 0);
          if (data.status === 'downloading') setDownloadStatus("DOWNLOADING...");
          else if (data.status === 'converting') setDownloadStatus("CONVERTING...");

          if (data.status === 'completed') {
            clearInterval(interval);
            resolve();
          } else if (data.status === 'error') {
            clearInterval(interval);
            reject(new Error('Conversion failed'));
          }
        }, 1000);
      });
    } catch (e) {
      alert('ERROR: ' + e.message);
      setIsDownloading(false);
      setProgress(0);
      setDownloadStatus("");
      return;
    }

    // Step 3: Trigger download by redirecting to backend directly, bypassing proxy!
    setDownloadStatus("SAVING...");
    // Use the proxy URL to ensure same-origin security context (fixes "not popping" issue)
    window.location.assign(`${API_BASE}/download/${jobId}`);

    setTimeout(() => {
      setIsDownloading(false);
      setProgress(0);
      setDownloadStatus("");
    }, 3000);
  };

  const getPlaceholder = () => {
    switch (theme) {
      case 'sith': return "Turn to the darkside...";
      case 'jedi': return "Trust the Force...";
      case 'mando': return "This is the way...";
      case 'yoda': return "Do or do not, there is no try...";
      default: return "Enter holonet URL...";
    }
  };

  return (
    <div className="search-container">
      <div
        className="input-wrapper"
        onClick={!isFocused && !isDownloading ? () => inputRef.current?.focus() : undefined}
        style={{ cursor: !isFocused && !isDownloading ? 'pointer' : 'default' }}
      >
        <input
          ref={inputRef}
          type="text"
          className={`sith-input ${isFocused || isDownloading ? 'visible' : 'hidden'}`}
          placeholder={getPlaceholder()}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => { if (!isDownloading) setIsFocused(false); }}
        />
        <div className={`lightsaber-underline ${isFocused || isDownloading ? 'ignited' : ''}`}>
          {theme === 'sith' && <VaderHilt />}
          {theme === 'jedi' && <AnakinHilt />}
          {theme === 'yoda' && <YodaHilt />}
          {theme === 'mando' && <DarksaberHilt />}
          <div className="blade"></div>
        </div>

        <div className={`progress-wrapper ${isDownloading ? 'visible' : ''}`}>
          <div className="progress-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
          {isDownloading && <div className="progress-text">{progress.toFixed(1)}%</div>}
        </div>
      </div>

      <button
        className={`download-btn ${isFocused || isDownloading || query ? 'visible' : ''} ${isDownloading ? 'pulse' : ''}`}
        onClick={() => handleDownload()}
        disabled={isDownloading}
      >
        {isDownloading ? downloadStatus : "DOWNLOAD"}
      </button>
    </div>
  );
};

const Hero = ({ theme, query, setQuery }) => {
  return (
    <section className="hero">
      <div className="ambient-glow"></div>
      <div className="hero-content">
        <LightsaberInput theme={theme} query={query} setQuery={setQuery} />
      </div>
    </section>
  );
};

const BackgroundParticles = () => {
  return (
    <div className="particles-container">
      <div className="ember ember-1"></div>
      <div className="ember ember-2"></div>
      <div className="ember ember-3"></div>
      <div className="ember ember-4"></div>
      <div className="ember ember-5"></div>
    </div>
  );
};

function App() {
  const [theme, setTheme] = useState('mando');
  const [queries, setQueries] = useState({ mando: '', jedi: '', sith: '', yoda: '' });

  useEffect(() => {
    document.body.className = `${theme}-theme`;
  }, [theme]);

  const handleSetQuery = (val) => {
    setQueries(prev => ({ ...prev, [theme]: val }));
  };

  return (
    <div className={`app-container ${theme}-theme-container`}>
      <div className="scanlines"></div>
      <BackgroundParticles />
      <Navbar setTheme={setTheme} />
      <main className="main-content">
        <Hero theme={theme} query={queries[theme]} setQuery={handleSetQuery} />
      </main>
      <footer className="footer">
        [ GALACTIC EMPIRE // SITH_OS_V1.0 ] <br />
        © 0BBY DESIGN BUREAU
      </footer>
    </div>
  );
}

export default App;
