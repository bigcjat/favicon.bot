import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Download, Loader2, ArrowRight, Package, Bot, Sparkles, ImagePlus, Pipette } from 'lucide-react';
import JSZip from 'jszip';
import Cropper, { type Area } from 'react-easy-crop';
import { getCroppedImg } from './utils/cropImage';
import './App.css';

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<{ name: string, url: string, reason: string, dim: string }[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropBorderRadius, setCropBorderRadius] = useState(0);
  const [cropBgColor, setCropBgColor] = useState('transparent');
  const [cropBorderWidth, setCropBorderWidth] = useState(4);
  const [cropBorderColor, setCropBorderColor] = useState('#0F172A');
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const [loadingMessage, setLoadingMessage] = useState("Waking up the conversion bot...");
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    if (loaded || !isLoading) return;

    const messages = [
      "Waking up the conversion bot...",
      "Downloading WebAssembly engine (30MB)...",
      "Initializing FFmpeg core...",
      "Allocating virtual filesystem...",
      "Almost ready..."
    ];
    let msgIndex = 0;

    const msgInterval = setInterval(() => {
      msgIndex++;
      if (msgIndex >= messages.length) {
        msgIndex = messages.length - 1;
        clearInterval(msgInterval);
      }
      setLoadingMessage(messages[msgIndex]);
    }, 3000);

    const progInterval = setInterval(() => {
      setLoadProgress(prev => {
        if (prev >= 95) return prev;
        const inc = prev < 40 ? 5 : prev < 75 ? 2 : 0.5;
        return Math.min(95, prev + inc);
      });
    }, 250);

    return () => {
      clearInterval(msgInterval);
      clearInterval(progInterval);
    };
  }, [loaded, isLoading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setResults([]);
    }
  };

  const convert = async () => {
    if (!file) return;
    setIsLoading(true);
    setResults([]);
    setZipUrl(null);
    const ffmpeg = ffmpegRef.current;

    if (!loaded) {
      try {
        const baseURL = '/ffmpeg';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setLoaded(true);
      } catch (e) {
        console.error("Failed to load ffmpeg", e);
        alert("Failed to load conversion engine. Check console for details.");
        setIsLoading(false);
        return;
      }
    }

    let targetFileName = 'cropped.png';
    let targetFileBlob: Blob = file;

    if (preview && croppedAreaPixels) {
      try {
        targetFileBlob = await getCroppedImg(preview, croppedAreaPixels, cropBgColor, cropBorderRadius, cropBorderWidth, cropBorderColor);
      } catch (err) {
        console.error("Cropping failed", err);
        alert("Failed to process the image crop. Please try a different image.");
        setIsLoading(false);
        return;
      }
    } else {
      // Fallback if no crop (shouldn't happen since we set crop area automatically)
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        try {
          targetFileBlob = await new Promise<File>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1024, img.width || 1024);
              canvas.height = Math.max(1024, img.height || 1024);
              const ctx = canvas.getContext('2d');
              if (!ctx) return reject(new Error('No canvas context'));
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob((blob) => {
                if (blob) resolve(new File([blob], targetFileName, { type: 'image/png' }));
                else reject(new Error('Blob conversion failed'));
              }, 'image/png');
            };
            img.onerror = () => reject(new Error('Failed to load SVG'));
            img.src = preview || URL.createObjectURL(file);
          });
        } catch (err) {
          console.error("SVG preprocessing failed", err);
          alert("Failed to read SVG file. Please try a PNG or JPG instead.");
          setIsLoading(false);
          return;
        }
      }
    }

    // Write the file to ffmpeg virtual file system
    await ffmpeg.writeFile(targetFileName, await fetchFile(targetFileBlob));

    // Convert to multiple sizes
    const sizes = [
      { name: 'favicon-16x16.png', args: ['-i', targetFileName, '-vf', 'scale=16:16', 'favicon-16x16.png'], reason: 'Desktop Tab (Small)', dim: '16x16' },
      { name: 'favicon-32x32.png', args: ['-i', targetFileName, '-vf', 'scale=32:32', 'favicon-32x32.png'], reason: 'Desktop Tab (Standard)', dim: '32x32' },
      { name: 'favicon.ico', args: ['-i', targetFileName, '-vf', 'scale=32:32', 'favicon.ico'], reason: 'Legacy Browsers (IE)', dim: '32x32' },
      { name: 'apple-touch-icon.png', args: ['-i', targetFileName, '-vf', 'scale=180:180', 'apple-touch-icon.png'], reason: 'Apple iOS Home Screen', dim: '180x180' },
      { name: 'android-chrome-192x192.png', args: ['-i', targetFileName, '-vf', 'scale=192:192', 'android-chrome-192x192.png'], reason: 'Android / PWA Icon', dim: '192x192' },
      { name: 'android-chrome-512x512.png', args: ['-i', targetFileName, '-vf', 'scale=512:512', 'android-chrome-512x512.png'], reason: 'Android Splash Screen', dim: '512x512' },
      { name: 'discord-icon.png', args: ['-i', targetFileName, '-vf', 'scale=512:512', 'discord-icon.png'], reason: 'Discord Server / App Icon', dim: '512x512' },
      { name: 'twitter-profile.png', args: ['-i', targetFileName, '-vf', 'scale=400:400', 'twitter-profile.png'], reason: 'Twitter / X Profile Picture', dim: '400x400' }
    ];

    try {
      const newResults = [];
      const zip = new JSZip();

      for (const size of sizes) {
        await ffmpeg.exec(size.args);
        const data = await ffmpeg.readFile(size.name);
        const blob = new Blob([(data as Uint8Array).buffer as any], { type: size.name.endsWith('.ico') ? 'image/x-icon' : 'image/png' });
        newResults.push({ name: size.name, url: URL.createObjectURL(blob), reason: size.reason, dim: size.dim });
        zip.file(size.name, blob);
      }

      // Generate site.webmanifest
      const manifestContent = JSON.stringify({
        name: "My Awesome Site",
        short_name: "Awesome Site",
        icons: [
          { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }
        ],
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone"
      }, null, 2);

      const manifestBlob = new Blob([manifestContent], { type: "application/manifest+json" });
      newResults.push({ name: "site.webmanifest", url: URL.createObjectURL(manifestBlob), reason: "PWA Configuration", dim: "JSON" });
      zip.file("site.webmanifest", manifestBlob);

      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        newResults.unshift({ name: "favicon.svg", url: URL.createObjectURL(file), reason: "Modern SVG Favicon", dim: "Vector" });
        zip.file("favicon.svg", file);
      }

      const zipContent = await zip.generateAsync({ type: 'blob' });
      setZipUrl(URL.createObjectURL(zipContent));

      setResults(newResults);
    } catch (err: any) {
      console.error("FFmpeg execution error", err);
      alert(`Conversion failed! Error: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="description-browser-window">
          <div className="browser-tab-bar">
            <div className="browser-tab">
              <img src="/favicon.svg" alt="favicon.bot logo" className="browser-tab-icon" />
              <h1 className="browser-tab-title">favicon.bot</h1>
            </div>
          </div>
          <div className="browser-window-content">
            <p>
              Instantly convert any image into perfectly optimized favicons, Apple Touch icons, and web manifests. 100% free, incredibly fast, and zero server uploads.
            </p>
          </div>
        </div>
      </header>

      <div className="sponsorship-banner" data-nosnippet="true" style={{ display: 'none' }}>
        <div className="sponsor-logo">
          <img src="/logobwb.svg" alt="AnimeKatsu Logo" />
        </div>

        <div className="sponsor-content">
          <div className="sponsor-tag-row">
            <span className="sponsor-tag">Sponsor</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>AnimeKatsu</div>
          </div>
          <p>
            Want to learn Japanese natively? Stop memorizing grammar and start watching anime. Join the beta and master the language through the Immersion Loop.
          </p>
          <a href="https://animekatsu.com" target="_blank" rel="noopener noreferrer nofollow sponsored" className="sponsor-btn">
            Discover AnimeKatsu <ArrowRight size={18} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          </a>
        </div>
      </div>

      <main className="converter-card">
        <label className="drop-zone" style={{ position: 'relative', paddingBottom: '220px', paddingTop: '2rem' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.8rem', marginBottom: '0.5rem', position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
            <ImagePlus size={32} color="var(--primary)" /> Drop your image here!
          </h2>
          <p style={{ color: 'var(--text-muted)', position: 'relative', zIndex: 2, fontSize: '1.1rem' }}>I work entirely in your browser, so your files stay 100% private.</p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem', position: 'relative', zIndex: 2 }}>
            {['SVG', 'PNG', 'JPG', 'WEBP', 'GIF', 'AVIF', 'BMP'].map(ext => (
              <span key={ext} style={{ background: 'var(--bg-card)', color: 'var(--text-main)', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 'bold', border: '2px solid var(--border-color)', boxShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>{ext}</span>
            ))}
          </div>
          <input type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp" onChange={handleFileChange} />
          <img src="/logo-transparent.webp" alt="favicon.bot mascot" style={{ position: 'absolute', bottom: '-52px', right: '-40px', width: '560px', zIndex: 3, pointerEvents: 'none' }} />
        </label>

        {preview && (
          <div className="preview-container" style={{ background: 'var(--card-bg)', border: '4px solid var(--border-color)', padding: '2rem', borderRadius: '16px', boxShadow: '8px 8px 0px var(--secondary)', margin: '2rem auto', maxWidth: '800px', display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
            
            <div style={{ width: '300px', flex: 'none', margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h2 style={{ marginBottom: '1rem', fontWeight: '900', fontSize: '1.4rem', color: 'var(--text-main)', margin: '0 0 1rem 0', textAlign: 'center' }}>Adjust Crop</h2>
              
              {/* Note: The Cropper wraps everything. We simulate the border radius and background color using standard CSS on its container, which helps visualize the final output shape before crop. */}
              <div style={{ position: 'relative', width: '300px', height: '300px', borderRadius: `${cropBorderRadius}%`, overflow: 'hidden', background: cropBgColor === 'transparent' ? 'repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 20px 20px' : cropBgColor, transition: 'background 0.3s, border-radius 0.3s' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: `${cropBorderRadius}%`, border: `${cropBorderWidth}px solid ${cropBorderColor}`, pointerEvents: 'none', zIndex: 10, boxSizing: 'border-box', transition: 'border-radius 0.3s' }}></div>
                <Cropper
                  image={preview}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropSize={{ width: 300, height: 300 }}
                  showGrid={false}
                  minZoom={0.1}
                  restrictPosition={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  style={{ containerStyle: { background: 'transparent' } }}
                />
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Zoom:</label>
                <input
                  type="range"
                  value={zoom}
                  min={0.1}
                  max={3}
                  step={0.05}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--primary)' }}
                />
              </div>
            </div>

            {/* Tools Sidebar */}
            <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left', background: 'var(--bg-color)', padding: '1rem', borderRadius: '12px', border: '2px solid var(--border-color)' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>Icon Shape</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => setCropBorderRadius(0)} className="btn" style={{ background: cropBorderRadius === 0 ? 'var(--primary)' : 'var(--bg-card)', color: cropBorderRadius === 0 ? '#000' : 'var(--text-main)', padding: '0.25rem 0.5rem', flex: 1, fontSize: '0.8rem', minHeight: 'auto', boxShadow: '2px 2px 0px var(--secondary)' }}>Square</button>
                  <button onClick={() => setCropBorderRadius(25)} className="btn" style={{ background: cropBorderRadius > 0 && cropBorderRadius < 50 ? 'var(--primary)' : 'var(--bg-card)', color: cropBorderRadius > 0 && cropBorderRadius < 50 ? '#000' : 'var(--text-main)', padding: '0.25rem 0.5rem', flex: 1, fontSize: '0.8rem', minHeight: 'auto', boxShadow: '2px 2px 0px var(--secondary)' }}>Rounded</button>
                  <button onClick={() => setCropBorderRadius(50)} className="btn" style={{ background: cropBorderRadius === 50 ? 'var(--primary)' : 'var(--bg-card)', color: cropBorderRadius === 50 ? '#000' : 'var(--text-main)', padding: '0.25rem 0.5rem', flex: 1, fontSize: '0.8rem', minHeight: 'auto', boxShadow: '2px 2px 0px var(--secondary)' }}>Circle</button>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>Corner Radius</h3>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{cropBorderRadius}%</span>
                </div>
                <input
                  type="range"
                  value={cropBorderRadius}
                  min={0}
                  max={50}
                  step={1}
                  onChange={(e) => setCropBorderRadius(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)', margin: '0.25rem 0 0 0' }}
                />
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>Background Color</h3>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {['transparent', '#ffffff', '#000000', '#F472B6', '#60A5FA', '#34D399', '#FBBF24'].map(color => (
                    <button
                      key={color}
                      onClick={() => setCropBgColor(color)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: color === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 50% / 10px 10px' : color,
                        border: cropBgColor === color ? '3px solid var(--primary)' : '2px solid var(--border-color)',
                        cursor: 'pointer',
                        transform: cropBgColor === color ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 0.1s',
                        boxShadow: '1px 1px 0px rgba(0,0,0,0.1)',
                        padding: 0
                      }}
                      title={color}
                    />
                  ))}
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid var(--border-color)', overflow: 'hidden', position: 'relative', boxShadow: '1px 1px 0px rgba(0,0,0,0.1)', background: cropBgColor === 'transparent' ? '#ffffff' : cropBgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input 
                      type="color" 
                      value={cropBgColor === 'transparent' ? '#ffffff' : cropBgColor} 
                      onChange={(e) => setCropBgColor(e.target.value)}
                      style={{ width: '200%', height: '200%', position: 'absolute', top: '-50%', left: '-50%', cursor: 'pointer', border: 'none', padding: 0, opacity: 0 }}
                      title="Custom Color"
                    />
                    <Pipette size={14} color="#ffffff" style={{ position: 'absolute', pointerEvents: 'none', zIndex: 1, mixBlendMode: 'difference' }} />
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>Border Width</h3>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{cropBorderWidth}px</span>
                </div>
                <input
                  type="range"
                  value={cropBorderWidth}
                  min={0}
                  max={20}
                  step={1}
                  onChange={(e) => setCropBorderWidth(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)', margin: '0.25rem 0 0 0' }}
                />
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>Border Color</h3>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {['#0F172A', '#ffffff', '#F472B6', '#60A5FA', '#34D399', '#FBBF24'].map(color => (
                    <button
                      key={color}
                      onClick={() => setCropBorderColor(color)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: color,
                        border: cropBorderColor === color ? '3px solid var(--primary)' : '2px solid var(--border-color)',
                        cursor: 'pointer',
                        transform: cropBorderColor === color ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 0.1s',
                        boxShadow: '1px 1px 0px rgba(0,0,0,0.1)',
                        padding: 0
                      }}
                      title={color}
                    />
                  ))}
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid var(--border-color)', overflow: 'hidden', position: 'relative', boxShadow: '1px 1px 0px rgba(0,0,0,0.1)', background: cropBorderColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input 
                      type="color" 
                      value={cropBorderColor} 
                      onChange={(e) => setCropBorderColor(e.target.value)}
                      style={{ width: '200%', height: '200%', position: 'absolute', top: '-50%', left: '-50%', cursor: 'pointer', border: 'none', padding: 0, opacity: 0 }}
                      title="Custom Color"
                    />
                    <Pipette size={14} color="#ffffff" style={{ position: 'absolute', pointerEvents: 'none', zIndex: 1, mixBlendMode: 'difference' }} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        <button
          className="btn"
          onClick={convert}
          disabled={!file || isLoading}
          style={{ marginTop: '1rem', marginBottom: '3rem', width: '100%', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}
        >
          {isLoading ? (
            <>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${!loaded ? loadProgress : 100}%`, backgroundColor: 'var(--primary)', transition: 'width 0.3s ease-out', zIndex: 0 }} />
              <Loader2 className="loading-spinner" size={20} style={{ position: 'relative', zIndex: 1 }} />
              <span style={{ position: 'relative', zIndex: 1 }}>{!loaded ? loadingMessage : "Working my magic..."}</span>
            </>
          ) : (
            <><Sparkles size={20} /> Convert My Image!</>
          )}
        </button>

        {results.length > 0 && (
          <>
            <div style={{ marginBottom: '2rem', textAlign: 'left', background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '12px', border: '3px solid var(--border-color)', boxShadow: '6px 6px 0px var(--border-color)', maxWidth: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.4rem' }}>How to use your new icons</h2>
                <button
                  className="btn"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', width: 'auto' }}
                  onClick={() => {
                    const isSvg = file && (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'));
                    const html = `${isSvg ? '<link rel="icon" type="image/svg+xml" href="/favicon.svg">\n' : ''}<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;
                    navigator.clipboard.writeText(html);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? 'Copied!' : 'Copy HTML'}
                </button>
              </div>

              <div style={{ fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '1rem' }}>
                <p><strong>Step 1:</strong> Download the <code>.zip</code> file using the big button below.</p>
                <p><strong>Step 2:</strong> Extract all the files directly into your website's root or <code>public/</code> folder.</p>
                <p><strong>Step 3:</strong> Paste this exact code inside the <code>&lt;head&gt;</code> tag of your website:</p>
              </div>

              <pre style={{ background: '#1E293B', padding: '1.5rem', borderRadius: '12px', overflowX: 'auto', maxWidth: '100%', fontSize: '0.95rem', marginTop: '0', border: '4px solid var(--border-color)', boxShadow: 'inset 4px 4px 0px rgba(0,0,0,0.3)' }}>
                <code style={{ display: 'block', background: 'transparent', padding: 0 }}>
                  {[
                    ...(file && (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) ? [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }] : []),
                    { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
                    { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
                    { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
                    { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
                    { rel: "manifest", href: "/site.webmanifest" }
                  ].map((attrs, i) => (
                    <div key={i} style={{ lineHeight: '1.5', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#FF7B72' }}>&lt;link</span>
                      {Object.entries(attrs).map(([k, v]) => (
                        <span key={k}>
                          {' '}<span style={{ color: '#79C0FF' }}>{k}</span>
                          <span style={{ color: '#C9D1D9' }}>=</span>
                          <span style={{ color: '#A5D6FF' }}>"{v}"</span>
                        </span>
                      ))}
                      <span style={{ color: '#FF7B72' }}>&gt;</span>
                    </div>
                  ))}
                </code>
              </pre>
            </div>

            {zipUrl && (
              <div style={{ margin: '0 0 2rem 0', paddingBottom: '2rem', borderBottom: '2px dashed var(--border-color)' }}>
                <a
                  href={zipUrl}
                  download="favicon.bot.zip"
                  className="btn"
                  style={{ backgroundColor: 'var(--primary)', width: '100%', justifyContent: 'center', fontSize: '1.25rem', padding: '1.25rem' }}
                >
                  <Package size={24} /> Download All (.zip)
                </a>
              </div>
            )}

            <div className="results-grid">
              {results.map((res) => (
                <div key={res.name} className="result-item" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.25rem', width: '100%', marginBottom: '1rem' }}>
                    {res.name.endsWith('.webmanifest') ? (
                      <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', border: '3px solid var(--border-color)', borderRadius: '12px', fontSize: '1rem', fontWeight: 'bold', flexShrink: 0 }}>JSON</div>
                    ) : (
                      <img src={res.url} alt={res.name} style={{ width: '64px', height: '64px', objectFit: 'scale-down', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 style={{ fontWeight: '900', fontSize: '1.75rem', color: 'var(--text-main)', margin: '0 0 0.25rem 0', lineHeight: 1 }}>{res.dim}</h3>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', background: 'var(--primary)', padding: '4px 10px', borderRadius: '6px', display: 'inline-block', border: '2px solid var(--border-color)', fontWeight: 'bold' }}>{res.reason}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem', fontFamily: 'var(--mono)', wordBreak: 'break-word', fontWeight: 600, minWidth: 0 }}>{res.name}</div>

                  <a href={res.url} download={res.name} className="download-link">
                    <Download size={18} /> Download
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <div style={{
        marginTop: '3rem',
        padding: '2rem',
        backgroundColor: '#1E293B',
        border: '4px solid var(--border-color)',
        borderRadius: '16px',
        boxShadow: '8px 8px 0px var(--border-color)',
        textAlign: 'left',
        color: '#E2E8F0',
        fontFamily: 'var(--mono)',
      }}>
        <h2 style={{ color: '#F8FAFC', margin: '0 0 1rem 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'inherit' }}>
          <Bot size={24} color="var(--primary)" /> Why slow down your site with a bloated favicon?
        </h2>
        <p style={{ color: '#94A3B8', fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '2rem', marginTop: 0 }}>
          Smaller file sizes don't mean lower quality! We use modern, highly-optimized compression to remove unnecessary file bloat. You get the exact same <strong>pixel-perfect quality</strong>, just at a fraction of the size.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', background: '#F8FAFC', padding: '2rem', borderRadius: '12px', border: '4px solid var(--border-color)', boxShadow: 'inset 4px 4px 0px rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'inherit', textAlign: 'center' }}>favicon.ico Performance Impact</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Competitor Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>Average Generators</span>
                <span style={{ color: '#EF4444' }}>Noticeable Delay (Bloated)</span>
              </div>
              <div style={{ width: '100%', height: '32px', background: 'white', border: '3px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', background: '#FF7B72', borderRight: '3px solid var(--border-color)', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 20px)' }}></div>
              </div>
            </div>

            {/* favicon.bot Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span style={{ color: 'var(--primary)', WebkitTextStroke: '1px black' }}>favicon.bot</span>
                <span style={{ color: '#10B981' }}>Up to 98% Faster</span>
              </div>
              <div style={{ width: '100%', height: '32px', background: 'white', border: '3px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ width: '10%', height: '100%', background: '#79C0FF', borderRight: '3px solid var(--border-color)', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.3) 10px, rgba(255,255,255,0.3) 20px)' }}></div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <footer style={{ marginTop: '4rem', padding: '2rem 1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '2px solid var(--border-color)', width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Made in 🗼 Tokyo with ❤️</div>
        <div>Powered by <a href="https://github.com/ffmpegwasm/ffmpeg.wasm" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 'bold' }}>FFmpeg.wasm</a>. FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project.</div>
      </footer>
    </div>
  );
}
