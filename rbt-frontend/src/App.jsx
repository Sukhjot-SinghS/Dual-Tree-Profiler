import { useState } from 'react'

export default function App() {
  const [inputValue, setInputValue] = useState("");
  const [viewMode, setViewMode] = useState('split'); 

  const [targets, setTargets] = useState({ avl: true, rbt: true });
  const [histories, setHistories] = useState({ avl: [], rbt: [] }); 
  const [lastStates, setLastStates] = useState({ avl: null, rbt: null });
  const [frames, setFrames] = useState({ avl: [], rbt: [] });   
  const [frameIndices, setFrameIndices] = useState({ avl: 0, rbt: 0 }); 

  const [isLoading, setIsLoading] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  
  const [telemetry, setTelemetry] = useState({ avl: null, rbt: null });
  const [showTelemetry, setShowTelemetry] = useState({ avl: false, rbt: false });
  const [benchmarkResults, setBenchmarkResults] = useState(null);

  const [scales, setScales] = useState({ avl: 0.9, rbt: 0.9 }); 
  const [offsets, setOffsets] = useState({ avl: { x: 0, y: 0 }, rbt: { x: 0, y: 0 } });
  const [draggingEngine, setDraggingEngine] = useState(null);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const handleAction = async (actionType) => {
    setIsLoading(true);
    let newFrames = { avl: [], rbt: [] };
    let newHistories = { ...histories };

    try {
      const engines = ['avl', 'rbt'];
      const promises = engines.map(async (engine) => {
        if (!targets[engine]) {
          newFrames[engine] = [{ tree_state: lastStates[engine], action_description: `[${engine.toUpperCase()}] Idle. Ignored input.` }];
          return;
        }

        let actionString = "";
        let requestHistory = [];
        
        if (actionType === 'undo') {
          if (histories[engine].length === 0) {
             newFrames[engine] = [{ tree_state: null, action_description: "Empty" }];
             return;
          }
          requestHistory = histories[engine].slice(0, -1);
          newHistories[engine] = requestHistory;
          
          if (requestHistory.length === 0) {
             newFrames[engine] = [{ tree_state: null, action_description: "Cleared." }];
             setLastStates(prev => ({ ...prev, [engine]: null }));
             setTelemetry(prev => ({ ...prev, [engine]: null }));
             return;
          }
          const lastAction = requestHistory[requestHistory.length - 1];
          requestHistory = requestHistory.slice(0, -1);
          actionString = lastAction;
        } else {
          const valToProcess = parseInt(inputValue);
          if (isNaN(valToProcess)) return;
          actionString = `${actionType}${valToProcess}`;
          requestHistory = histories[engine];
          newHistories[engine] = [...histories[engine], actionString];
        }

        const response = await fetch(`http://127.0.0.1:8000/api/action/${engine}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action_type: actionString[0], value: parseInt(actionString.substring(1)), history: requestHistory })
        });
        
        const data = await response.json();
        const engineFrames = data.animation_frames || [];
        newFrames[engine] = engineFrames;
        
        if (data.telemetry) setTelemetry(prev => ({ ...prev, [engine]: data.telemetry }));
        if (engineFrames.length > 0) setLastStates(prev => ({ ...prev, [engine]: engineFrames[engineFrames.length - 1].tree_state }));
      });

      await Promise.all(promises);

      setFrames(newFrames);
      setHistories(newHistories);
      
      setFrameIndices({
        avl: newFrames.avl.length > 0 ? newFrames.avl.length - 1 : 0,
        rbt: newFrames.rbt.length > 0 ? newFrames.rbt.length - 1 : 0
      });
      
      // Only clear the input box if it wasn't an undo command
      if (actionType !== 'undo') {
        setInputValue("");
      }

    } catch (e) { console.error("API Error:", e); }
    setIsLoading(false);
  };

  const runStressTest = async (mode) => {
    setIsLoading(true);
    let massiveHistory = [];
    const nodeCount = 50; 

    if (mode === 'sequential') {
      for (let i = 1; i <= nodeCount; i++) massiveHistory.push(`i${i}`);
    } else {
      for (let i = 1; i <= nodeCount; i++) massiveHistory.push(`i${Math.floor(Math.random() * 1000)}`);
    }

    const lastAction = massiveHistory.pop();
    const actionType = lastAction[0];
    const actionVal = parseInt(lastAction.substring(1));

    let newFrames = { avl: [], rbt: [] };

    try {
      const engines = ['avl', 'rbt'];
      const promises = engines.map(async (engine) => {
        if (!targets[engine]) return;
        const response = await fetch(`http://127.0.0.1:8000/api/action/${engine}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action_type: actionType, value: actionVal, history: massiveHistory })
        });

        const data = await response.json();
        const engineFrames = data.animation_frames || [];
        newFrames[engine] = engineFrames;

        if (data.telemetry) setTelemetry(prev => ({ ...prev, [engine]: data.telemetry }));
        if (engineFrames.length > 0) setLastStates(prev => ({ ...prev, [engine]: engineFrames[engineFrames.length - 1].tree_state }));
      });

      await Promise.all(promises);

      massiveHistory.push(lastAction);
      setHistories({ avl: massiveHistory, rbt: massiveHistory });
      setFrames(newFrames);
      
      setFrameIndices({
        avl: newFrames.avl.length > 0 ? newFrames.avl.length - 1 : 0,
        rbt: newFrames.rbt.length > 0 ? newFrames.rbt.length - 1 : 0
      });
    } catch (e) { console.error("Stress Test Error:", e); }
    setIsLoading(false);
  };

  const runTrueBenchmark = async () => {
    setIsLoading(true);
    setHistories({avl: [], rbt: []});
    setLastStates({avl: null, rbt: null});
    setFrames({avl: [], rbt: []});
    setFrameIndices({avl: 0, rbt: 0});
    setBenchmarkResults(null); 

    try {
      const engines = ['avl', 'rbt'];
      const results = {};
      const promises = engines.map(async (engine) => {
        if (!targets[engine]) return;
        const response = await fetch(`http://127.0.0.1:8000/api/action/${engine}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action_type: 'B', value: 10000, history: [] })
        });
        const data = await response.json();
        if (data.telemetry) {
          setTelemetry(prev => ({ ...prev, [engine]: data.telemetry }));
          results[engine] = data.telemetry;
        }
      });
      await Promise.all(promises);
      if (results.avl && results.rbt) setBenchmarkResults(results);
    } catch (e) { console.error("Benchmark Error:", e); }
    setIsLoading(false);
  };

  const stepEngine = (engine, direction) => {
    setFrameIndices(prev => {
      const newIdx = prev[engine] + direction;
      const maxIdx = frames[engine].length > 0 ? frames[engine].length - 1 : 0;
      return { ...prev, [engine]: Math.min(Math.max(newIdx, 0), maxIdx) };
    });
  };

  const handleWheel = (e, engine) => { 
    e.stopPropagation(); 
    const delta = e.deltaY > 0 ? -0.08 : 0.08; 
    setScales(prev => ({ ...prev, [engine]: Math.min(Math.max(prev[engine] + delta, 0.2), 2.5) })); 
  };
  
  const handleMouseDown = (e, engine) => { 
    e.stopPropagation(); 
    setDraggingEngine(engine); 
    setLastMousePos({ x: e.clientX, y: e.clientY }); 
  };
  
  const handleMouseMove = (e) => { 
    if (!draggingEngine) return; 
    e.stopPropagation(); 
    setOffsets(prev => ({
      ...prev,
      [draggingEngine]: {
        x: prev[draggingEngine].x + (e.clientX - lastMousePos.x),
        y: prev[draggingEngine].y + (e.clientY - lastMousePos.y)
      }
    }));
    setLastMousePos({ x: e.clientX, y: e.clientY }); 
  };

  const renderArchive = (rootNode, engineStatus, isTargeted, engineName) => {
    const rootX = viewMode === 'split' ? 300 : 500; 
    const dxWidth = viewMode === 'split' ? 250 : 400;
    const watermarkText = engineName === 'avl' ? 'STRICT AVL' : 'RED-BLACK';

    const renderWatermark = () => (
      <text x={rootX} y="220" textAnchor="middle" fill="#d4a373" opacity="0.15" fontSize="70px" fontWeight="900" letterSpacing="4px" style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {watermarkText}
      </text>
    );

    if (engineStatus === "OFFLINE") return <g>{renderWatermark()}<text x={rootX} y="250" textAnchor="middle" fill="#bc4749" fontWeight="bold">ENGINE OFFLINE</text></g>;
    if (!isTargeted && !rootNode) return <g>{renderWatermark()}<text x={rootX} y="250" textAnchor="middle" fill="#4a3728" opacity="0.3">IDLE</text></g>;
    if (!rootNode) return <g>{renderWatermark()}<text x={rootX} y="250" textAnchor="middle" fill="#4a3728" opacity="0.4">Awaiting Data</text></g>;

    const nodesToRender = [];
    const edgesToRender = [];
    
    const calculateLayout = (node, x, y, dx) => {
      if (!node) return;
      nodesToRender.push({ node, x, y });
      if (node.left) { 
        edgesToRender.push({ childId: node.left.id, px: x, py: y, cx: x - dx, cy: y + 80 }); 
        calculateLayout(node.left, x - dx, y + 80, dx / 2); 
      }
      if (node.right) { 
        edgesToRender.push({ childId: node.right.id, px: x, py: y, cx: x + dx, cy: y + 80 }); 
        calculateLayout(node.right, x + dx, y + 80, dx / 2); 
      }
    };
    
    calculateLayout(rootNode, rootX, 60, dxWidth);
    const animStyle = { transition: 'all 1.2s cubic-bezier(0.68, -0.55, 0.27, 1.55)' };

    return (
      <g style={{ opacity: isTargeted ? 1 : 0.5, transition: 'opacity 0.5s ease' }}>
        {renderWatermark()}
        <g id="ropes-layer">
          {edgesToRender.map(e => (
            <path key={`rope-${e.childId}`} d={`M ${e.px} ${e.py} Q ${(e.px + e.cx) / 2} ${(e.py + e.cy) / 2 + 15} ${e.cx} ${e.cy}`}
              fill="none" stroke="#4a3728" strokeWidth="2" strokeDasharray="3,3" style={{ ...animStyle, opacity: 0.6 }} />
          ))}
        </g>
        <g id="nodes-layer">
          {nodesToRender.map(({ node, x, y }) => (
            <g key={node.id} style={{ transform: `translate(${x}px, ${y}px)`, ...animStyle }}>
              <circle cx={3} cy={3} r="16" fill="rgba(0,0,0,0.2)" style={animStyle} />
              <circle cx={0} cy={0} r="16" fill={node.color === "RED" ? "#bc4749" : "#2b2d42"} 
                stroke={node.is_highlighted || node.has_error ? "#ffb703" : "#4a3728"} strokeWidth={node.is_highlighted || node.has_error ? "2.5" : "1.5"} 
                style={{ transition: 'fill 0.5s ease, stroke 0.5s ease', filter: (node.is_highlighted || node.has_error) ? 'drop-shadow(0 0 5px #ffb703)' : 'none' }} />
              <text x={0} y={4} textAnchor="middle" fill="#f2e8cf" fontSize="11px" fontWeight="bold" style={animStyle}>{node.value}</text>
              {node.has_error && <text x={0} y={-28} textAnchor="middle" fill="#bc4749" fontSize="9px" fontWeight="bold" style={animStyle}>{node.error_msg}</text>}
              {node.highlight_role === "SUCCESSOR" && (
                <g className="bounce-pointer" style={animStyle}>
                  <path d="M -8 -38 L 8 -38 L 0 -24 Z" fill="#ffb703" />
                  <text x={0} y={-44} textAnchor="middle" fill="#ffb703" fontSize="10px" fontWeight="bold" letterSpacing="1px">SUCCESSOR</text>
                </g>
              )}
            </g>
          ))}
        </g>
      </g>
    );
  };

  const getFrameData = (engine) => frames[engine][Math.min(frameIndices[engine], frames[engine].length - 1)];
  const getFrameState = (engine) => getFrameData(engine)?.tree_state || lastStates[engine];
  const enginesToRender = viewMode === 'split' ? ['avl', 'rbt'] : [viewMode];

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes burn { 100% { transform: scale(0) rotate(10deg); opacity: 0; } }
        @keyframes bounceArrow { 0% { transform: translateY(0px); } 100% { transform: translateY(-6px); } }
        .bounce-pointer { animation: bounceArrow 0.6s cubic-bezier(0.8, 0, 0.2, 1) infinite alternate; }
        .canvas-bg { background-image: radial-gradient(#d4a373 0.7px, transparent 0.7px); background-size: 24px 24px; }
        .status-unstable { color: #bc4749; }
        .status-stable { color: #386641; }
      `}</style>

      {benchmarkResults && (
        <div style={styles.modalOverlay}>
          <div style={styles.benchmarkModal}>
            <h2 style={{color: '#f2e8cf', borderBottom: '2px dashed #4a3728', paddingBottom: '10px', marginBottom: '20px'}}>
              🏆 10,000 NODE BENCHMARK RESULTS
            </h2>
            <div style={{display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '20px'}}>
              <div style={styles.benchCard}>
                <h3 style={{color: '#d4a373', textAlign: 'center', marginBottom: '15px'}}>STRICT AVL</h3>
                <div style={styles.benchRow}><span>Execution Time:</span><span style={{color: '#a7c957'}}>{benchmarkResults.avl.execution_time_us} µs</span></div>
                <div style={styles.benchRow}><span>Total Rotations:</span><span style={{color: '#ffb703'}}>{benchmarkResults.avl.rotations}</span></div>
                <div style={styles.benchSubRow}><span>↳ Left:</span><span>{benchmarkResults.avl.left_rotations}</span></div>
                <div style={styles.benchSubRow}><span>↳ Right:</span><span>{benchmarkResults.avl.right_rotations}</span></div>
                <div style={styles.benchRow}><span>Recolors:</span><span style={{color: '#8d99ae'}}>{benchmarkResults.avl.recolors}</span></div>
              </div>
              <div style={styles.benchCard}>
                <h3 style={{color: '#bc4749', textAlign: 'center', marginBottom: '15px'}}>RED-BLACK TREE</h3>
                <div style={styles.benchRow}><span>Execution Time:</span><span style={{color: '#a7c957'}}>{benchmarkResults.rbt.execution_time_us} µs</span></div>
                <div style={styles.benchRow}><span>Total Rotations:</span><span style={{color: '#ffb703'}}>{benchmarkResults.rbt.rotations}</span></div>
                <div style={styles.benchSubRow}><span>↳ Left:</span><span>{benchmarkResults.rbt.left_rotations}</span></div>
                <div style={styles.benchSubRow}><span>↳ Right:</span><span>{benchmarkResults.rbt.right_rotations}</span></div>
                <div style={styles.benchRow}><span>Recolors:</span><span style={{color: '#bc4749'}}>{benchmarkResults.rbt.recolors}</span></div>
              </div>
            </div>
            <button onClick={() => setBenchmarkResults(null)} style={styles.closeBtn}>Close Report</button>
          </div>
        </div>
      )}

      <div style={{...styles.parchment, ...(isBurning ? { animation: 'burn 0.5s ease-in forwards' } : {})}}>
        <div style={styles.viewToggles}>
          <div style={styles.viewToggles}>
          <button onClick={() => setViewMode('avl')} style={{...styles.toggleBtn, opacity: viewMode === 'avl' ? 1 : 0.5}}>AVL</button>
          <button onClick={() => setViewMode('split')} style={{...styles.toggleBtn, opacity: viewMode === 'split' ? 1 : 0.5}}>DUAL-CORE</button>
          <button onClick={() => setViewMode('rbt')} style={{...styles.toggleBtn, opacity: viewMode === 'rbt' ? 1 : 0.5}}>RBT</button>
        </div>
        </div>
        <h1 style={styles.title}>✧ ARCHIVE SYSTEM ✧</h1>
        
        <div style={styles.controlPanel}>
          <div style={styles.targetGroup}>
            <span style={{fontSize: '11px', color: '#4a3728', fontWeight: '900'}}>TARGET:</span>
            <button onClick={() => setTargets(p => ({...p, avl: !p.avl}))} style={{...styles.indieTargetBtn, opacity: targets.avl ? 1 : 0.4}}>AVL</button>
            <button onClick={() => setTargets(p => ({...p, rbt: !p.rbt}))} style={{...styles.indieTargetBtn, opacity: targets.rbt ? 1 : 0.4}}>RBT</button>
          </div>
          <div style={styles.separator}></div>
          <div style={styles.inputArea}>
            <input type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAction('i'); }} placeholder="??" style={styles.input} />
            <button onClick={() => handleAction('i')} style={{...styles.gameBtn, backgroundColor: '#386641'}}>Insert</button>
            <button onClick={() => handleAction('d')} style={{...styles.gameBtn, backgroundColor: '#7f5539'}}>Delete</button>
            <button onClick={() => handleAction('undo')} style={{...styles.gameBtn, backgroundColor: '#a68a64'}}>Undo Target</button>
            <button onClick={() => { setIsBurning(true); setTimeout(() => { setHistories({avl:[],rbt:[]}); setLastStates({avl:null,rbt:null}); setFrames({avl:[],rbt:[]}); setFrameIndices({avl:0,rbt:0}); setTelemetry({avl:null, rbt:null}); setShowTelemetry({avl:false, rbt:false}); setIsBurning(false); setScales({avl:0.9, rbt:0.9}); setOffsets({avl:{x:0,y:0}, rbt:{x:0,y:0}}); }, 500); }} style={{...styles.gameBtn, backgroundColor: '#4a3728'}}>Trash All</button>
            
            <div style={styles.separator}></div>
            <button onClick={() => runStressTest('random')} style={{...styles.gameBtn, backgroundColor: '#5f0f40'}}>🎲 Rand (50)</button>
            <button onClick={runTrueBenchmark} style={{...styles.gameBtn, backgroundColor: '#1e1e24', color: '#d4a373', border: '3px solid #d4a373'}}>
              ⚖️ Benchmark (10k)
            </button>
          </div>
        </div>

        <div style={styles.trinityContainer} onMouseMove={handleMouseMove} onMouseUp={() => setDraggingEngine(null)} onMouseLeave={() => setDraggingEngine(null)}>
          {enginesToRender.map((engine, idx) => {
            const maxFrames = frames[engine].length || 0;
            const currentIdx = frameIndices[engine];
            const isStable = maxFrames === 0 || currentIdx === maxFrames - 1;

            return (
              <div key={engine} className="canvas-bg" style={{...styles.column, borderLeft: idx > 0 ? '4px solid #4a3728' : 'none'}} onWheel={(e) => handleWheel(e, engine)} onMouseDown={(e) => handleMouseDown(e, engine)}>
                
                <div style={styles.slimHeader}>
                  <div style={styles.independentLog}>
                    <div className={isStable ? "status-stable" : "status-unstable"} style={{fontSize: '9px', fontWeight: 'bold', padding: '2px 5px', border: `1px solid ${isStable ? '#386641' : '#bc4749'}`, borderRadius: '2px', marginRight: '5px'}}>
                      {telemetry[engine]?.is_benchmark ? '⚡ NATIVE' : (isStable ? '✅ STABLE' : '🔄 REBALANCING')}
                    </div>
                    
                    {/* RESTORED: THE STEP BUTTONS! */}
                    {!telemetry[engine]?.is_benchmark && (
                      <>
                        <button disabled={currentIdx === 0} onClick={() => stepEngine(engine, -1)} style={styles.arrowBtn}>«</button>
                        <span style={styles.stepInfo}>{currentIdx + 1}/{maxFrames || 0}</span>
                        <button disabled={currentIdx >= maxFrames - 1} onClick={() => stepEngine(engine, 1)} style={styles.arrowBtn}>»</button>
                      </>
                    )}
                  </div>
                  
                  {/* RESTORED: THE ACTION DESCRIPTION! */}
                  {!telemetry[engine]?.is_benchmark && (
                    <div style={styles.descriptionText}>
                      {getFrameData(engine)?.action_description || "Awaiting Orders..."}
                    </div>
                  )}

                  {telemetry[engine] && !telemetry[engine].is_benchmark && (
                    <button onClick={() => setShowTelemetry(prev => ({...prev, [engine]: !prev[engine]}))} style={styles.telemetryToggleBtn}>
                      {showTelemetry[engine] ? 'Hide Metrics' : '📊 View Metrics'}
                    </button>
                  )}
                </div>

                {telemetry[engine] && showTelemetry[engine] && !telemetry[engine].is_benchmark && (
                  <div style={{
                    position: 'absolute', top: '35px', left: '15px', 
                    backgroundColor: '#1b1b1b', color: '#f2e8cf', 
                    padding: '10px 15px', borderRadius: '4px', border: '2px solid #ffb703',
                    display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 5, boxShadow: '4px 4px 0px rgba(0,0,0,0.8)',
                    minWidth: '220px'
                  }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #4a3728', paddingBottom: '4px'}}>
                      <span style={{color: '#8d99ae', fontSize: '9px', letterSpacing: '1px'}}>EXECUTION TIME</span>
                      <span style={{fontSize: '14px', color: '#a7c957', fontWeight: '900'}}>{telemetry[engine].execution_time_us} µs</span>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#8d99ae', fontSize: '9px', letterSpacing: '1px'}}>TOTAL ROTATIONS</span>
                      <span style={{fontSize: '14px', color: '#ffb703', fontWeight: '900'}}>{telemetry[engine].rotations}</span>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', paddingLeft: '10px', fontSize: '10px', color: '#adb5bd'}}>
                      <span>↳ Left Rotations:</span><span style={{fontWeight: 'bold', color: '#f2e8cf'}}>{telemetry[engine].left_rotations}</span>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', paddingLeft: '10px', fontSize: '10px', color: '#adb5bd'}}>
                      <span>↳ Right Rotations:</span><span style={{fontWeight: 'bold', color: '#f2e8cf'}}>{telemetry[engine].right_rotations}</span>
                    </div>
                    {engine === 'rbt' && (
                      <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px dashed #4a3728', paddingTop: '6px'}}>
                        <span style={{color: '#8d99ae', fontSize: '9px', letterSpacing: '1px'}}>COLOR FLIPS</span>
                        <span style={{fontSize: '14px', color: '#bc4749', fontWeight: '900'}}>{telemetry[engine].recolors}</span>
                      </div>
                    )}
                  </div>
                )}

                <svg width="100%" height="100%" viewBox={viewMode === 'split' ? "0 0 600 500" : "0 0 1000 600"} style={{ overflow: 'visible', pointerEvents: 'none', marginTop: '40px' }}>
                  <g transform={`translate(${offsets[engine].x}, ${offsets[engine].y}) scale(${scales[engine]})`} style={{ pointerEvents: 'auto', transformOrigin: viewMode === 'split' ? '300px 50px' : '500px 50px' }}>
                    {renderArchive(getFrameState(engine), frames[engine]?.error ? "OFFLINE" : "ONLINE", targets[engine], engine)}
                  </g>
                </svg>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { height: '100vh', width: '100vw', backgroundColor: '#f2e8cf', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'monospace', overflow: 'hidden' },
  parchment: { backgroundColor: '#f2e8cf', padding: '10px 20px 20px 20px', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' },
  viewToggles: { position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '4px', backgroundColor: '#4a3728', padding: '2px 12px 4px 12px', borderRadius: '0 0 6px 6px', zIndex: 50 },
  toggleBtn: { backgroundColor: '#d4a373', color: '#4a3728', border: '2px solid #f2e8cf', padding: '2px 16px', fontWeight: '900', fontSize: '9px', cursor: 'pointer', whiteSpace: 'nowrap' },
  title: { color: '#4a3728', fontSize: '20px', marginBottom: '10px', marginTop: '20px', fontWeight: 'bold', textAlign: 'center' },
   controlPanel: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginBottom: '12px', flexWrap: 'wrap' },
  targetGroup: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#e9dcb5', padding: '6px 12px', border: '2px solid #4a3728', borderRadius: '3px' },
  indieTargetBtn: { backgroundColor: '#f2e8cf', border: '2px solid #4a3728', color: '#4a3728', fontWeight: '900', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', boxShadow: '2px 2px 0px #4a3728' },
  separator: { height: '30px', width: '2px', backgroundColor: '#4a3728', opacity: 0.3 },
  inputArea: { display: 'flex', alignItems: 'center', gap: '8px' },
  input: { padding: '6px', border: '3px solid #4a3728', backgroundColor: '#fffcf2', width: '60px', fontSize: '14px', fontWeight: 'bold', color: '#4a3728', outline: 'none', textAlign: 'center' },
  gameBtn: { padding: '6px 12px', border: '3px solid #4a3728', color: '#f2e8cf', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '3px 3px 0px #4a3728' },
  trinityContainer: { border: '4px solid #4a3728', backgroundColor: '#fffcf2', flex: 1, display: 'flex', overflow: 'hidden', cursor: 'grab' },
  column: { flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  slimHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(242, 232, 207, 0.9)', borderBottom: '2px dashed #4a3728', padding: '6px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#4a3728', zIndex: 10 },
  independentLog: { display: 'flex', alignItems: 'center', gap: '8px' },
  arrowBtn: { background: '#4a3728', color: '#f2e8cf', border: 'none', padding: '2px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', borderRadius: '2px' },
  stepInfo: { fontSize: '11px', fontWeight: 'bold' },
  descriptionText: { fontSize: '11px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.9, maxWidth: '300px', textAlign: 'right' },
  telemetryToggleBtn: { backgroundColor: '#e9dcb5', border: '2px solid #4a3728', padding: '2px 8px', fontSize: '9px', fontWeight: 'bold', color: '#4a3728', cursor: 'pointer', borderRadius: '2px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' },
  benchmarkModal: { backgroundColor: '#1e1e24', padding: '30px', borderRadius: '4px', border: '4px solid #d4a373', boxShadow: '0px 10px 30px rgba(0,0,0,1)', maxWidth: '700px', width: '100%', fontFamily: 'monospace' },
  benchCard: { flex: 1, backgroundColor: '#2b2d42', padding: '20px', borderRadius: '4px', border: '1px solid #4a3728', color: '#f2e8cf', fontSize: '14px', fontWeight: 'bold' },
  benchRow: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '8px' },
  benchSubRow: { display: 'flex', justifyContent: 'space-between', paddingLeft: '15px', color: '#adb5bd', fontSize: '12px', marginBottom: '6px' },
  closeBtn: { marginTop: '10px', padding: '10px 20px', backgroundColor: '#bc4749', color: '#f2e8cf', border: '2px solid #f2e8cf', fontWeight: 'bold', cursor: 'pointer', width: '100%', fontSize: '14px' }
}