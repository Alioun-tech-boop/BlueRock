export default function PatrimoineSectionStyles() {
  return <style jsx global>{`
    .safe-area .status-card {
      background: linear-gradient(160deg, rgba(42,203,138,0.10), rgba(42,203,138,0.02) 55%);
      border: 1px solid rgba(42,203,138,0.32); border-radius: 22px;
      padding: 20px; margin-bottom: 16px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      position: relative; overflow: hidden;
    }
    .safe-area .status-card.cancelled {
      background: linear-gradient(160deg, rgba(240,68,56,0.08), rgba(240,68,56,0.02) 55%);
      border-color: rgba(240,68,56,0.32);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px -18px rgba(240,68,56,0.3);
    }
    .safe-area .status-card.completed {
      background: linear-gradient(160deg, rgba(167,139,250,0.09), rgba(167,139,250,0.02) 55%);
      border-color: rgba(167,139,250,0.32);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px -18px rgba(167,139,250,0.3);
    }
    .safe-area .status-head { display: flex; align-items: center; margin-bottom: 16px; }
    .safe-area .status-badge {
      display: flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 600; padding: 6px 13px; border-radius: 999px;
      font-family: Inter, sans-serif; letter-spacing: 0.15px;
    }
    .safe-area .status-badge.active {
      color: #2ACB8A; background: rgba(42,203,138,0.14); border: 1px solid rgba(42,203,138,0.4);
    }
    .safe-area .status-badge.completed {
      color: #a78bfa; background: rgba(167,139,250,0.14); border: 1px solid rgba(167,139,250,0.4);
      box-shadow: 0 0 16px rgba(167,139,250,0.25);
    }
    .safe-area .status-badge.cancelled {
      color: #F04438; background: rgba(240,68,56,0.12); border: 1px solid rgba(240,68,56,0.4);
      box-shadow: 0 0 16px rgba(240,68,56,0.2);
    }
    .safe-area .status-id { margin-left: auto; font-size: 11px; color: #5F6D85; font-weight: 600; letter-spacing: 0.15px; }
    .safe-area .status-dates { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 16px; }
    .safe-area .status-dates > div {
      display: flex; flex-direction: column; gap: 3px;
      background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px; padding: 11px 14px;
    }
    .safe-area .status-dates b { font-size: 14.5px; color: #F7F8FA; font-variant-numeric: tabular-nums; font-weight: 600; }
    .safe-area .status-note { font-size: 13px; color: #C9C9C9; line-height: 1.5; margin-top: 14px; background: rgba(0,0,0,0.3); border-radius: 14px; padding: 12px 14px; border: 1px solid rgba(255,255,255,0.05); }
    .safe-area .emitted-note {
      display: flex; align-items: center; gap: 7px;
      font-size: 12px; color: #C9EAD9; margin-top: 14px; line-height: 1.4;
      background: rgba(42,203,138,0.07); border: 1px dashed rgba(42,203,138,0.35);
      border-radius: 12px; padding: 10px 13px;
    }
    .safe-area .progress-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
    .safe-area .progress-row .stat-l { flex-shrink: 0; }
    .safe-area .progress-track {
      flex: 1; height: 10px; background: rgba(255,255,255,0.07);
      border-radius: 999px; overflow: hidden;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.6);
    }
    .safe-area .progress-fill {
      height: 100%; border-radius: 999px;
      background: linear-gradient(90deg, #2ACB8A, #4ea8ff);
      transition: width .5s cubic-bezier(.22,.61,.36,1);
      position: relative;
    }
    .safe-area .progress-fill::after {
      content: ''; position: absolute; top: 2px; left: 6px; right: 6px; height: 2px;
      background: rgba(255,255,255,0.35); border-radius: 999px;
    }
    .safe-area .progress-txt { font-size: 13px; font-weight: 700; color: #2ACB8A; width: 46px; text-align: right; font-variant-numeric: tabular-nums; }
    .safe-area .cancel-btn {
      width: 100%; margin-top: 16px; padding: 14px; border-radius: 16px;
      border: 1px solid rgba(240,68,56,0.4); background: rgba(240,68,56,0.08);
      color: #F04438; font-size: 14px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit;
      transition: background .2s ease, transform .12s ease;
    }
    .safe-area .cancel-btn:active { transform: scale(0.985); background: rgba(240,68,56,0.14); }
    .safe-area .curve { width: 100%; height: 110px; display: block; }
    .safe-area .curve-line { stroke: #2ACB8A; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .safe-area .curve-fill { fill: url(#pfCurveGrad); }
    .safe-area .curve-base { stroke: rgba(255,255,255,0.14); stroke-width: 1; stroke-dasharray: 4 4; }
    .safe-area .curve-axis {
      display: flex; justify-content: space-between; font-size: 11px; color: #5F6D85;
      margin-top: 8px; font-variant-numeric: tabular-nums;
    }
    .safe-area .curve-hint { font-size: 12px; color: #5F6D85; line-height: 1.4; margin-top: 6px; }
    .safe-area .coverage-bar {
      height: 12px; background: rgba(255,255,255,0.07); border-radius: 999px; overflow: hidden;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.6); margin-bottom: 10px;
    }
    .safe-area .coverage-fill {
      height: 100%; border-radius: 999px;
      background: linear-gradient(90deg, #4ea8ff, #2ACB8A);
      box-shadow: 0 0 14px rgba(78,168,255,0.5);
      transition: width .5s ease;
    }
    .safe-area .coverage-val { display: flex; align-items: baseline; gap: 8px; font-size: 13.5px; }
    .safe-area .coverage-hint { color: #8C99AF; font-size: 12px; line-height: 1.4; }
    .safe-area .alert-row { padding: 13px 2px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .safe-area .alert-row:last-child { border-bottom: none; }
    .safe-area .alert-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 14px; font-weight: 600; color: #a78bfa;
      font-family: Inter, sans-serif;
    }
    .safe-area .alert-title::before {
      content: ''; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      background: #a78bfa; box-shadow: 0 0 10px rgba(167,139,250,0.7);
    }
    .safe-area .alert-body { font-size: 13px; color: #C9C9C9; line-height: 1.45; margin-top: 4px; padding-left: 15px; }
    .safe-area .alert-date { font-size: 11px; color: #5F6D85; margin-top: 5px; padding-left: 15px; font-variant-numeric: tabular-nums; }
    .safe-area .plan-no-alerts {
      font-size: 13px; color: #8C99AF; text-align: center; padding: 10px 0;
      border: 1px dashed rgba(255,255,255,0.1); border-radius: 14px;
    }
    .safe-area .bars { display: flex; align-items: flex-end; gap: 8px; height: 150px; padding-top: 20px; }
    .safe-area .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; height: 100%; }
    .safe-area .bar-val {
      font-size: 11px; color: #8C99AF; font-variant-numeric: tabular-nums;
      white-space: nowrap; transform: scale(0.92); font-weight: 500;
    }
    .safe-area .bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; background: transparent; }
    .safe-area .bar-fill {
      width: 100%; border-radius: 7px 7px 3px 3px;
      background: linear-gradient(180deg, #2ACB8A, #158A5B);
      transition: height .5s ease;
      position: relative;
    }
    .safe-area .bar-fill::after {
      content: ''; position: absolute; top: 2px; left: 20%; right: 20%; height: 2px;
      background: rgba(255,255,255,0.3); border-radius: 999px;
    }
    .safe-area .bar-year { font-size: 11px; color: #5F6D85; font-weight: 600; }
    .safe-area .alloc-head { display: flex; align-items: center; gap: 13px; margin-bottom: 16px; }
    .safe-area .alloc-logo {
      width: 50px; height: 50px; border-radius: 15px; object-fit: contain; padding: 7px; box-sizing: border-box; flex-shrink: 0;
      background: #ffffff; border: 1px solid #242424;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
    }
    .safe-area .alloc-logo.placeholder {
      display: flex; align-items: center; justify-content: center;
      color: #2ACB8A; font-weight: 700; font-size: 15px;
      background: linear-gradient(150deg, rgba(42,203,138,0.16), rgba(42,203,138,0.03));
      font-family: Inter, sans-serif;
    }
    .safe-area .alloc-info { flex: 1; min-width: 0; }
    .safe-area .alloc-name {
      font-size: 17px; font-weight: 600; color: #F7F8FA; letter-spacing: -0.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-family: Inter, sans-serif;
    }
    .safe-area .alloc-meta { font-size: 13px; font-weight: 400; color: #8C99AF; margin-top: 2px; }
    .safe-area .action-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 600; padding: 5px 11px; border-radius: 9px; flex-shrink: 0;
      font-family: Inter, sans-serif; letter-spacing: 0.15px; text-transform: uppercase;
    }
    .safe-area .action-badge.buy { color: #2ACB8A; background: rgba(42,203,138,0.12); border: 1px solid rgba(42,203,138,0.35); }
    .safe-area .action-badge.add { color: #4ea8ff; background: rgba(78,168,255,0.12); border: 1px solid rgba(78,168,255,0.35); }
    .safe-area .action-badge.hold { color: #9AA3B2; background: rgba(154,163,178,0.12); border: 1px solid rgba(154,163,178,0.3); }
    .safe-area .action-badge.sell { color: #F04438; background: rgba(240,68,56,0.12); border: 1px solid rgba(240,68,56,0.35); box-shadow: 0 0 12px rgba(240,68,56,0.2); }
    .safe-area .action-badge.reduce { color: #a78bfa; background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.35); }
    .safe-area .action-badge.watch { color: #4ea8ff; background: rgba(78,168,255,0.12); border: 1px solid rgba(78,168,255,0.35); }
    .safe-area .kv-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 11px 18px; margin-bottom: 16px; }
    .safe-area .kv {
      display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13.5px;
      padding-bottom: 9px; border-bottom: 1px solid rgba(255,255,255,0.045);
    }
    .safe-area .kv span { color: #8C99AF; }
    .safe-area .kv b { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; color: #F7F8FA; }
    .safe-area .tranche-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
    .safe-area .tranche-label { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #8C99AF; width: 100%; margin-bottom: 4px; font-weight: 500; }
    .safe-area .tranche-chip {
      font-size: 12px; font-weight: 600; color: #2ACB8A;
      background: rgba(42,203,138,0.09); border: 1px solid rgba(42,203,138,0.28);
      padding: 6px 13px; border-radius: 999px; letter-spacing: 0.1px;
    }
    .safe-area .level-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .safe-area .lvl {
      background: linear-gradient(180deg, #101010, #0A0A0A); border: 1px solid #242424; border-radius: 15px;
      padding: 11px 12px; display: flex; flex-direction: column; gap: 4px;
    }
    .safe-area .lvl-l { font-size: 10.5px; color: #8C99AF; letter-spacing: 0.15px; font-weight: 500; }
    .safe-area .lvl b { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; font-family: Inter, sans-serif; }
    .safe-area .rationale {
      font-size: 13px; line-height: 1.45; color: #C9C9C9;
      background: linear-gradient(180deg, #101010, #0A0A0A); border: 1px solid #242424;
      border-radius: 15px; padding: 13px 15px;
    }
    .safe-area .ai-note {
      display: flex; gap: 8px; align-items: flex-start;
      font-size: 12.5px; line-height: 1.45; color: #C9EAD9;
      background: rgba(42,203,138,0.06); border: 1px solid rgba(42,203,138,0.2);
      border-radius: 15px; padding: 13px 15px; margin-top: 10px;
    }
    .safe-area .ai-badge {
      margin-left: auto; font-size: 10.5px; font-weight: 600; letter-spacing: 0;
      color: #2ACB8A; background: rgba(42,203,138,0.12);
      border: 1px solid rgba(42,203,138,0.4); border-radius: 8px; padding: 3px 9px;
      font-family: Inter, sans-serif;
    }
    .safe-area .ai-highlights { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
    .safe-area .ai-hl { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; line-height: 1.45; color: #C9C9C9; }
    .safe-area .ai-hl svg { flex-shrink: 0; margin-top: 2px; }
    .safe-area .advice p { font-size: 14px; line-height: 1.55; color: #D9D9D9; margin: 0; }
    .safe-area .pos-row { display: flex; align-items: center; gap: 11px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
    .safe-area .pos-row:last-child { border-bottom: none; }
    .safe-area .pos-sym {
      font-weight: 600; font-size: 13.5px; width: 62px; flex-shrink: 0;
      font-family: Inter, sans-serif; color: #F7F8FA;
    }
    .safe-area .pos-why { color: #8C99AF; flex: 1; line-height: 1.4; }
    .safe-area .trig-row {
      padding: 13px 2px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .safe-area .trig-row:last-child { border-bottom: none; }
    .safe-area .trig-row b {
      display: flex; align-items: center; gap: 8px;
      font-size: 14px; color: #F04438; margin-bottom: 4px;
      font-family: Inter, sans-serif;
    }
    .safe-area .trig-row b::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
      background: #F04438; box-shadow: 0 0 8px rgba(240,68,56,0.6);
    }
    .safe-area .trig-row span { font-size: 13px; color: #8C99AF; line-height: 1.45; padding-left: 14px; display: block; }
    .safe-area .reinvest-note {
      display: flex; align-items: center; gap: 9px;
      font-size: 13px; color: #C9EAD9; background: rgba(42,203,138,0.07);
      border: 1px dashed rgba(42,203,138,0.4); border-radius: 17px; padding: 14px 17px; margin-bottom: 14px;
      line-height: 1.4;
    }
    .safe-area .disclaimer { font-size: 11.5px; color: #5F6D85; line-height: 1.45; margin-bottom: 16px; }
    .safe-area .align-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      font-size: 12.5px; color: #8C99AF;
      background: rgba(78,168,255,0.06); border: 1px solid rgba(78,168,255,0.2);
      border-radius: 13px; padding: 10px 13px; margin-bottom: 16px;
    }
    .safe-area .align-row span { display: flex; align-items: center; gap: 6px; }
    .safe-area .align-row b { font-weight: 700; font-variant-numeric: tabular-nums; }
    .safe-area .f-label {
      display: block; font-size: 11px; font-weight: 800; color: #8C99AF;
      margin: 18px 0 9px; font-family: Inter, sans-serif;
      letter-spacing: 0.09em; text-transform: uppercase;
    }
    .safe-area .f-opt { color: #5F6D85; font-weight: 600; font-family: Inter, sans-serif; letter-spacing: 0.05em; text-transform: none; }
    .safe-area .f-input {
      width: 100%; box-sizing: border-box;
      background: #000000; border: 1px solid #262626; border-radius: 15px;
      color: #F7F8FA; font-size: 15.5px; font-weight: 600; padding: 15px 17px;
      font-family: inherit; font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
      transition: border-color .2s ease, box-shadow .2s ease;
    }
    .safe-area .f-input::placeholder { color: #3F4B5E; font-weight: 500; }
    .safe-area .f-input:focus { border-color: rgba(42,203,138,0.7); box-shadow: 0 0 0 3px rgba(42,203,138,0.12); }
    .safe-area .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .safe-area .chip {
      padding: 12px 18px; border-radius: 999px; font-size: 13px; font-weight: 700;
      background: #0D0D0D; color: #8C99AF; border: 1px solid #242424; cursor: pointer; font-family: inherit;
      transition: all .18s ease; letter-spacing: -0.01em;
    }
    .safe-area .chip:active { transform: scale(0.97); }
    .safe-area .chip.active {
      background: rgba(42,203,138,0.13); color: #2ACB8A; border-color: rgba(42,203,138,0.55);
      font-weight: 800;
    }
    .safe-area .gen-btn {
      width: 100%; margin-top: 22px; padding: 16px; border-radius: 17px; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 9px;
      background: linear-gradient(135deg, #2ACB8A, #4ea8ff); color: #06231A;
      font-size: 15.5px; font-weight: 800; font-family: Inter, sans-serif; letter-spacing: -0.01em;
      transition: transform .12s ease;
    }
    .safe-area .gen-btn:active { transform: scale(0.985); }
    .safe-area .gen-btn:disabled { opacity: 0.6; cursor: default; }
    .safe-area .spin { animation: spin 1s linear infinite; }
    .safe-area .error-box {
      margin-top: 14px; padding: 13px 15px; border-radius: 15px; font-size: 13px;
      background: rgba(240,68,56,0.09); color: #F04438; border: 1px solid rgba(240,68,56,0.3);
      line-height: 1.4;
    }
    .safe-area .type-hero {
      display: flex; gap: 14px; align-items: flex-start;
      background: linear-gradient(150deg, rgba(42,203,138,0.13), rgba(78,168,255,0.05) 60%, rgba(0,0,0,0) 100%);
      border: 1px solid rgba(42,203,138,0.32);
      border-radius: 22px; padding: 18px 20px; margin-bottom: 16px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      position: relative; overflow: hidden;
    }
    .safe-area .type-hero-ico {
      width: 50px; height: 50px; border-radius: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(42,203,138,0.15); color: #2ACB8A; border: 1px solid rgba(42,203,138,0.35);
    }
    .safe-area .type-hero-name {
      font-size: 21px; font-weight: 800; color: #F7F8FA; display: flex; align-items: center; gap: 8px;
      font-family: Inter, sans-serif; letter-spacing: -0.03em; line-height: 1.15;
    }
    .safe-area .type-hero-desc { font-size: 13px; font-weight: 500; color: #8C99AF; line-height: 1.5; margin-top: 4px; }
    .safe-area .rec-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .safe-area .rec-chip {
      font-size: 10.5px; font-weight: 800; color: #C9EAD9; text-transform: uppercase;
      background: rgba(42,203,138,0.09); border: 1px solid rgba(42,203,138,0.28);
      padding: 6px 12px; border-radius: 999px; letter-spacing: 0.08em;
    }
    .safe-area .sub-links { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 16px; scrollbar-width: none; -ms-overflow-style: none; }
    .safe-area .sub-links::-webkit-scrollbar { display: none; }
    .safe-area .sl-item {
      flex-shrink: 0; height: 40px; padding: 0 17px; border-radius: 999px; border: none; cursor: pointer;
      font-family: inherit; font-size: 13px; font-weight: 600; letter-spacing: 0; white-space: nowrap;
      background: #FFFFFF; color: #111111; transition: transform .12s ease;
    }
    .safe-area .sl-item:active { transform: scale(0.97); }
    .safe-area .sl-item.alt { background: #141414; color: #8996AE; border: 1px solid #242424; }
    .safe-area .sec-title {
      display: flex; align-items: center; gap: 9px;
      font-size: 14.5px; font-weight: 800; color: #F7F8FA;
      font-family: Inter, sans-serif; letter-spacing: -0.02em;
    }
    .safe-area .sec-title-ico {
      width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(42,203,138,0.12); color: #2ACB8A; border: 1px solid rgba(42,203,138,0.3);
    }
    .safe-area .stack-bar {
      display: flex; height: 12px; border-radius: 8px; overflow: hidden;
      background: rgba(255,255,255,0.06); margin-top: 14px; gap: 2px;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.6);
    }
    .safe-area .stack-seg { height: 100%; min-width: 3px; border-radius: 3px; transition: width .4s ease; }
    .safe-area .stack-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 13px; }
    .safe-area .stack-chip { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #9AA3B2; font-weight: 500; }
    .safe-area .stack-chip b { color: #F7F8FA; font-weight: 600; font-variant-numeric: tabular-nums; }
    .safe-area .stack-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .safe-area .card {
      background: linear-gradient(180deg, #141414, #0E0E0E);
      border: 1px solid #222222; border-radius: 22px;
      padding: 20px; margin-bottom: 16px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px -20px rgba(0,0,0,0.8);
    }
    .safe-area .card-title {
      display: flex; align-items: center; gap: 9px;
      font-size: 15px; font-weight: 800; color: #F7F8FA; margin-bottom: 16px;
      font-family: Inter, sans-serif; letter-spacing: -0.02em;
    }
    .safe-area .card-title-inline {
      display: flex; align-items: center; gap: 9px;
      font-size: 15px; font-weight: 800; color: #F7F8FA; margin: 20px 0 12px;
      font-family: Inter, sans-serif; letter-spacing: -0.02em;
    }
    .safe-area .uni-badge { margin-left: auto; font-size: 12px; color: #8C99AF; font-weight: 500; }
    .safe-area .green { color: #2ACB8A !important; }
    .safe-area .red { color: #F04438 !important; }
    .safe-area .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
    .safe-area .sum-hint { font-size: 12px; color: #5F6D85; text-align: center; margin: -8px 4px 16px; line-height: 1.45; }
    .safe-area .stat {
      background: linear-gradient(180deg, #131313, #0C0C0C); border: 1px solid #222222; border-radius: 18px; padding: 15px 16px;
      display: flex; flex-direction: column; gap: 5px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .safe-area .stat.gold {
      background: linear-gradient(150deg, rgba(42,203,138,0.16), rgba(42,203,138,0.03) 70%);
      border: 1px solid rgba(42,203,138,0.4);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .safe-area .stat-l {
      font-size: 11px; font-weight: 800; color: #8C99AF;
      text-transform: uppercase; letter-spacing: 0.09em;
    }
    .safe-area .stat-v {
      font-size: 20px; font-weight: 800; color: #F7F8FA;
      font-variant-numeric: tabular-nums; font-family: Inter, sans-serif; letter-spacing: -0.02em;
    }
    .safe-area .stat.gold .stat-v { color: #2ACB8A; font-size: 20px; }
    .safe-area .stat.up .stat-v { color: #2ACB8A; }
    .safe-area .empty-box {
      display: flex; flex-direction: column; align-items: center; gap: 13px;
      padding: 80px 24px; text-align: center;
    }
    .safe-area .empty-ring {
      width: 100px; height: 100px; border-radius: 50%;
      border: 4px solid #2A2A2A; display: flex; align-items: center; justify-content: center;
      color: #2ACB8A;
    }
    .safe-area .empty-title {
      font-size: 20px; font-weight: 800; color: #F7F8FA; letter-spacing: -0.02em;
      font-family: Inter, sans-serif;
    }
    .safe-area .empty-sub { font-size: 13.5px; font-weight: 500; color: #8C99AF; line-height: 1.55; }
    .safe-area .empty-btn {
      margin-top: 10px; height: 56px; padding: 0 36px; border-radius: 17px; cursor: pointer;
      background: #FFFFFF; color: #111111; border: none;
      font-size: 15px; font-weight: 800; font-family: Inter, sans-serif; letter-spacing: -0.01em;
      box-shadow: 0 10px 28px -10px rgba(255,255,255,0.35);
      transition: transform .12s ease;
      display: flex; align-items: center; gap: 9px;
    }
    .safe-area .empty-btn:active { transform: scale(0.97); }
    .safe-area .footer-note { text-align: center; font-size: 11px; font-weight: 700; color: #4A5770; padding: 14px 0 6px; letter-spacing: 0.14em; text-transform: uppercase; }
  `}</style>
}

export function pfCurveGradient() {
  return (
    <defs>
      <linearGradient id="pfCurveGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2ACB8A" stopOpacity="0.30" />
        <stop offset="100%" stopColor="#2ACB8A" stopOpacity="0.02" />
      </linearGradient>
    </defs>
  )
}