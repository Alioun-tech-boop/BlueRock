export default function PatrimoineSectionStyles() {
  return <style jsx>{`
    .status-card {
      background: linear-gradient(135deg, rgba(42,203,138,0.12), rgba(42,203,138,0.04));
      border: 1px solid rgba(42,203,138,0.35); border-radius: 20px;
      padding: 18px 20px; margin-bottom: 14px;
    }
    .status-card.cancelled { background: rgba(240,68,56,0.06); border-color: rgba(240,68,56,0.35); }
    .status-card.completed { background: rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.35); }
    .status-head { display: flex; align-items: center; margin-bottom: 14px; }
    .status-badge {
      display: flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px;
    }
    .status-badge.active { color: #2ACB8A; background: rgba(42,203,138,0.14); box-shadow: 0 0 12px rgba(42,203,138,0.3); }
    .status-badge.completed { color: #a78bfa; background: rgba(139,92,246,0.14); }
    .status-badge.cancelled { color: #F04438; background: rgba(240,68,56,0.12); }
    .status-id { margin-left: auto; font-size: 11px; color: #4A5770; font-weight: 700; }
    .status-dates { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 16px; }
    .status-dates > div { display: flex; flex-direction: column; gap: 2px; }
    .status-dates b { font-size: 14px; color: #F7F8FA; font-variant-numeric: tabular-nums; }
    .status-note { font-size: 13px; color: #C9C9C9; line-height: 1.355; margin-top: 12px; }
    .emitted-note {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: #C9EAD9; margin-top: 12px; line-height: 1.35;
    }
    .progress-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
    .progress-row .stat-l { flex-shrink: 0; }
    .progress-track { flex: 1; height: 9px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #2ACB8A, #4ea8ff); border-radius: 999px; transition: width .4s; box-shadow: 0 0 12px rgba(42,203,138,0.45); }
    .progress-txt { font-size: 12px; font-weight: 700; color: #2ACB8A; width: 42px; text-align: right; }
    .cancel-btn {
      width: 100%; margin-top: 14px; padding: 13px; border-radius: 14px;
      border: 1px solid rgba(240,68,56,0.4); background: rgba(240,68,56,0.08);
      color: #F04438; font-size: 14px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 7px; font-family: inherit;
    }
    .curve { width: 100%; height: 90px; display: block; }
    .curve-line { stroke: #2ACB8A; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(42,203,138,0.6)); }
    .curve-fill { fill: rgba(42,203,138,0.12); }
    .curve-base { stroke: rgba(255,255,255,0.15); stroke-width: 1; stroke-dasharray: 4 4; }
    .curve-axis { display: flex; justify-content: space-between; font-size: 11px; color: #5F6D85; margin-top: 6px; font-variant-numeric: tabular-nums; }
    .curve-hint { font-size: 12px; color: #5F6D85; line-height: 1.35; margin-top: 6px; }
    .coverage-bar { height: 11px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
    .coverage-fill { height: 100%; background: linear-gradient(90deg, #4ea8ff, #2ACB8A); border-radius: 999px; box-shadow: 0 0 12px rgba(78,168,255,0.45); }
    .coverage-val { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
    .coverage-hint { color: #8C99AF; font-size: 12px; line-height: 1.35; }
    .alert-row { padding: 12px 0; border-bottom: 1px solid #1B2941; }
    .alert-row:last-child { border-bottom: none; }
    .alert-title { font-size: 14px; font-weight: 700; color: #a78bfa; }
    .alert-body { font-size: 13px; color: #C9C9C9; line-height: 1.355; margin-top: 3px; }
    .alert-date { font-size: 11px; color: #5F6D85; margin-top: 4px; }
    .plan-no-alerts { font-size: 13px; color: #8C99AF; text-align: center; padding: 8px 0; }
    .bars { display: flex; align-items: flex-end; gap: 8px; height: 130px; padding-top: 16px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
    .bar-val { font-size: 11px; color: #8C99AF; font-variant-numeric: tabular-nums; }
    .bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; background: transparent; }
    .bar-fill {
      width: 100%; border-radius: 6px 6px 2px 2px;
      background: linear-gradient(180deg, #2ACB8A, #1d8f48);
      box-shadow: 0 0 10px rgba(42,203,138,0.35);
    }
    .bar-year { font-size: 11px; color: #5F6D85; }
    .alloc-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .alloc-logo {
      width: 46px; height: 46px; border-radius: 14px; object-fit: cover; flex-shrink: 0;
      background: #0D162B; border: 1px solid #1B2941;
    }
    .alloc-logo.placeholder {
      display: flex; align-items: center; justify-content: center;
      color: #2ACB8A; font-weight: 700; font-size: 14px;
    }
    .alloc-info { flex: 1; min-width: 0; }
    .alloc-name { font-size: 18px; font-weight: 700; color: #F7F8FA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .alloc-meta { font-size: 14px; font-weight: 400; color: #8C99AF; }
    .action-badge {
      font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 8px; flex-shrink: 0;
    }
    .action-badge.buy { color: #2ACB8A; background: rgba(42,203,138,0.12); box-shadow: 0 0 10px rgba(42,203,138,0.25); }
    .action-badge.add { color: #4ea8ff; background: rgba(78,168,255,0.12); }
    .action-badge.hold { color: #8C99AF; background: rgba(140,153,175,0.12); }
    .action-badge.sell { color: #F04438; background: rgba(240,68,56,0.12); box-shadow: 0 0 10px rgba(240,68,56,0.2); }
    .action-badge.reduce { color: #a78bfa; background: rgba(139,92,246,0.12); }
    .action-badge.watch { color: #4ea8ff; background: rgba(78,168,255,0.12); }
    .kv-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 16px; margin-bottom: 14px; }
    .kv { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; }
    .kv span { color: #8C99AF; }
    .kv b { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
    .tranche-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
    .tranche-label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #8C99AF; width: 100%; margin-bottom: 2px; }
    .tranche-chip {
      font-size: 12px; font-weight: 600; color: #2ACB8A;
      background: rgba(42,203,138,0.1); border: 1px solid rgba(42,203,138,0.25);
      padding: 5px 12px; border-radius: 999px;
    }
    .level-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .lvl {
      background: #0D162B; border: 1px solid #1B2941; border-radius: 14px;
      padding: 10px 12px; display: flex; flex-direction: column; gap: 3px;
    }
    .lvl-l { font-size: 11px; color: #8C99AF; }
    .lvl b { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .rationale { font-size: 13px; line-height: 1.35; color: #C9C9C9; background: #0D162B; border-radius: 14px; padding: 12px 14px; }
    .ai-note {
      display: flex; gap: 6px; align-items: flex-start;
      font-size: 12.5px; line-height: 1.355; color: #C9EAD9;
      background: rgba(42,203,138,0.07); border: 1px solid rgba(42,203,138,0.18);
      border-radius: 14px; padding: 12px 14px; margin-top: 8px;
    }
    .ai-badge {
      margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
      color: #2ACB8A; background: rgba(42,203,138,0.12);
      border: 1px solid rgba(42,203,138,0.35); border-radius: 8px; padding: 2px 8px;
    }
    .ai-highlights { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .ai-hl { display: flex; gap: 6px; align-items: flex-start; font-size: 12.5px; line-height: 1.355; color: #C9C9C9; }
    .ai-hl svg { flex-shrink: 0; margin-top: 1px; }
    .advice p { font-size: 14px; line-height: 1.35; color: #D9D9D9; margin: 0; }
    .pos-row { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #1B2941; font-size: 13px; }
    .pos-row:last-child { border-bottom: none; }
    .pos-sym { font-weight: 700; font-size: 14px; width: 60px; flex-shrink: 0; }
    .pos-why { color: #8C99AF; flex: 1; }
    .trig-row { padding: 11px 0; border-bottom: 1px solid #1B2941; }
    .trig-row:last-child { border-bottom: none; }
    .trig-row b { display: block; font-size: 14px; color: #2ACB8A; margin-bottom: 3px; }
    .trig-row span { font-size: 13px; color: #8C99AF; line-height: 1.35; }
    .reinvest-note {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: #C9EAD9; background: rgba(42,203,138,0.08);
      border: 1px dashed rgba(42,203,138,0.4); border-radius: 16px; padding: 13px 16px; margin-bottom: 12px;
    }
    .disclaimer { font-size: 11.5px; color: #4A5770; line-height: 1.35; margin-bottom: 14px; }
    .align-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      font-size: 12.5px; color: #8C99AF;
      background: rgba(78,168,255,0.07); border: 1px solid rgba(78,168,255,0.18);
      border-radius: 12px; padding: 9px 12px; margin-bottom: 14px;
    }
    .align-row span { display: flex; align-items: center; gap: 5px; }
    .align-row b { font-weight: 700; }
    .f-label { display: block; font-size: 14px; font-weight: 400; color: #8C99AF; margin: 14px 0 7px; }
    .f-opt { color: #4A5770; font-weight: 400; }
    .f-input {
      width: 100%; box-sizing: border-box;
      background: #0D162B; border: 1px solid #1B2941; border-radius: 14px;
      color: #F7F8FA; font-size: 16px; font-weight: 600; padding: 13px 16px; outline: none;
      font-family: inherit; font-variant-numeric: tabular-nums;
    }
    .f-input:focus { border-color: #2ACB8A; box-shadow: 0 0 12px rgba(42,203,138,0.2); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .chip {
      padding: 10px 16px; border-radius: 999px; font-size: 13px; font-weight: 600;
      background: #0D162B; color: #8C99AF; border: 1px solid #1B2941; cursor: pointer; font-family: inherit;
    }
    .chip.active { background: rgba(42,203,138,0.14); color: #2ACB8A; border-color: #2ACB8A; box-shadow: 0 0 12px rgba(42,203,138,0.25); }
    .gen-btn {
      width: 100%; margin-top: 18px; padding: 15px; border-radius: 16px; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      background: linear-gradient(135deg, #2ACB8A, #4ea8ff); color: #06231A;
      font-size: 17px; font-weight: 600; font-family: inherit; letter-spacing: 0.25px;
      box-shadow: 0 0 24px rgba(42,203,138,0.35), 0 0 52px rgba(78,168,255,0.2);
    }
    .gen-btn:disabled { opacity: 0.6; cursor: default; }
    .spin { animation: spin 1s linear infinite; }
    .error-box {
      margin-top: 12px; padding: 12px 14px; border-radius: 14px; font-size: 13px;
      background: rgba(240,68,56,0.1); color: #F04438; border: 1px solid rgba(240,68,56,0.3);
    }
    .type-hero {
      display: flex; gap: 12px; align-items: flex-start;
      background: linear-gradient(135deg, rgba(42,203,138,0.14), rgba(78,168,255,0.06));
      border: 1px solid rgba(42,203,138,0.35);
      border-radius: 20px; padding: 16px 18px; margin-bottom: 14px;
    }
    .type-hero-ico {
      width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(42,203,138,0.15); color: #2ACB8A;
    }
    .type-hero-name { font-size: 18px; font-weight: 700; color: #F7F8FA; display: flex; align-items: center; gap: 8px; }
    .type-hero-desc { font-size: 13px; color: #8C99AF; line-height: 1.4; margin-top: 3px; }
    .rec-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .rec-chip {
      font-size: 12px; font-weight: 600; color: #C9EAD9;
      background: rgba(42,203,138,0.1); border: 1px solid rgba(42,203,138,0.3);
      padding: 4px 11px; border-radius: 999px;
    }
    .sub-links { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 14px; scrollbar-width: none; -ms-overflow-style: none; }
    .sub-links::-webkit-scrollbar { display: none; }
    .sl-item {
      flex-shrink: 0; height: 38px; padding: 0 16px; border-radius: 999px; border: none; cursor: pointer;
      font-family: inherit; font-size: 13px; font-weight: 600; letter-spacing: 0.25px; white-space: nowrap;
      background: #FFFFFF; color: #111111;
    }
    .sl-item.alt { background: #1C2740; color: #8996AE; }
  `}</style>
}
