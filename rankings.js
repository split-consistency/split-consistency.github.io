(() => {
  'use strict';
  const figure = document.getElementById('rankings');
  const fallback = figure?.querySelector('img');
  if (!fallback) return;

  const names = {
    'liquid/d1-ultra': 'Liquid D1 Ultra',
    'nace-ai/drex-v1.5': 'Drex 1.5',
    'liquid/d1': 'Liquid D1',
    'typesafe/jev-1.14': 'Jev 1.14',
    'typesafe/jev-1.13': 'Jev 1.13',
    'inception/mercury-decide': 'Mercury Decide',
    'microsoft/microsoft-decision-1': 'Microsoft Decision 1',
    'openai/gpt-6-luna-decisions': 'GPT-6 Luna Decisions',
    'convaiinnovations/laya': 'Laya',
  };
  const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22'];
  const percent = score => `${(score * 100).toFixed(1)}%`;
  function svgElement(tag, attributes = {}, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function parseData(csv) {
    // Handle CRLF, quoted fields, and escaped quotes without a runtime dependency.
    const records = [];
    let row = [], field = '', quoted = false;
    const text = csv.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    for (let i = 0; i <= text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (c === ',' || c === '\n' || c === undefined)) {
        row.push(field.trim()); field = '';
        if (c !== ',') {
          if (row.some(value => value !== '')) records.push(row);
          row = [];
        }
      } else if (c !== undefined) field += c;
    }
    if (quoted) throw new Error('Unclosed CSV quote.');
    const header = records.shift() || [];
    const required = ['epsilon', 'model', 'consistency_score', 'display_position'];
    if (!required.every(key => header.includes(key))) throw new Error('Missing ranking CSV columns.');
    const rows = records.map(values => {
      if (values.length !== header.length) throw new Error('Invalid ranking CSV row.');
      const record = Object.fromEntries(header.map((key, index) => [key, values[index]]));
      const row = {
        model: record.model,
        epsilon: Number(record.epsilon),
        score: Number(record.consistency_score),
        position: Number(record.display_position),
      };
      if (!required.every(key => record[key] !== '') || !Number.isFinite(row.epsilon) || row.epsilon <= 0
          || !Number.isFinite(row.score) || row.score < 0 || row.score > 1
          || !Number.isInteger(row.position) || row.position < 1) throw new Error('Invalid ranking value.');
      return row;
    });
    const epsilons = [...new Set(rows.map(row => row.epsilon))].sort((a, b) => a - b);
    if (epsilons.length < 2) throw new Error('At least two tolerances are required.');
    const first = rows.filter(row => row.epsilon === epsilons[0]).sort((a, b) => a.position - b.position);
    const models = first.map(row => row.model);
    if (!models.length || new Set(models).size !== models.length) throw new Error('Duplicate ranking model.');
    for (const epsilon of epsilons) {
      const points = rows.filter(row => row.epsilon === epsilon).sort((a, b) => a.position - b.position);
      if (points.length !== models.length || new Set(points.map(row => row.model)).size !== models.length
          || points.some((row, index) => !models.includes(row.model) || row.position !== index + 1
            || (index > 0 && row.score > points[index - 1].score))) {
        throw new Error(`Invalid display positions or missing models at tolerance ${epsilon}.`);
      }
      for (const row of points) row.tied = points.some(other => other.model !== row.model && other.score === row.score);
    }
    return { rows, epsilons, models };
  }

  function mount({ rows, epsilons, models }) {
    const root = document.createElement('div');
    root.className = 'consistency-chart ranking-chart';
    const heading = document.createElement('div');
    heading.className = 'consistency-chart-heading';
    heading.textContent = 'Self-Consistency Rankings';
    const plot = document.createElement('div');
    plot.className = 'ranking-plot';
    const tooltip = document.createElement('div');
    tooltip.className = 'consistency-tooltip';
    tooltip.id = 'ranking-score-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    const title = document.createElement('strong');
    const tolerance = document.createElement('span');
    const score = document.createElement('span');
    const tie = document.createElement('span');
    tooltip.append(title, tolerance, score, tie);

    const table = document.createElement('table');
    table.className = 'visually-hidden';
    const caption = document.createElement('caption');
    caption.textContent = 'Ranking display positions and split consistency scores. Equal scores are tied, even at separate display positions.';
    table.append(caption);
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    for (const label of ['Model', 'Tolerance', 'Display position', 'Score']) {
      const cell = document.createElement('th');
      cell.setAttribute('scope', 'col'); cell.textContent = label; header.append(cell);
    }
    head.append(header); table.append(head);
    const body = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      [names[row.model] || row.model, row.epsilon.toFixed(2), row.position, percent(row.score)].forEach((value, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.setAttribute('scope', 'row');
        cell.textContent = String(value); tr.append(cell);
      });
      body.append(tr);
    }
    table.append(body); root.append(heading, plot, table);
    let focused = null;
    let width = 0;

    function select(target) {
      const model = target?.getAttribute('data-model');
      plot.classList.toggle('has-highlight', Boolean(model));
      for (const group of plot.querySelectorAll('.ranking-series')) {
        group.classList.toggle('is-highlighted', group.getAttribute('data-model') === model);
      }
      for (const point of plot.querySelectorAll('.ranking-point')) point.removeAttribute('aria-describedby');
      tooltip.hidden = !target?.hasAttribute('data-epsilon');
      if (tooltip.hidden) return;
      target.setAttribute('aria-describedby', tooltip.id);
      title.textContent = names[model] || model;
      const epsilon = Number(target.getAttribute('data-epsilon')).toFixed(2);
      if (window.katex) window.katex.render(`\\varepsilon = ${epsilon}`, tolerance, { throwOnError: false });
      else tolerance.textContent = `ε = ${epsilon}`;
      score.textContent = `Score = ${percent(Number(target.getAttribute('data-score')))}`;
      tie.textContent = target.getAttribute('data-tied') === 'true' ? 'Tied score' : '';
      const bounds = plot.getBoundingClientRect();
      const point = target.querySelector('circle').getBoundingClientRect();
      const center = point.left - bounds.left + point.width / 2;
      tooltip.style.left = `${Math.max(0, Math.min(bounds.width - tooltip.offsetWidth, center - tooltip.offsetWidth / 2))}px`;
      const above = point.top - bounds.top - tooltip.offsetHeight - 10;
      tooltip.style.top = `${above >= 0 ? above : point.bottom - bounds.top + 10}px`;
    }
    function targetFor(node) { return node?.closest?.('.ranking-point, .ranking-series') || null; }
    plot.addEventListener('pointerover', event => {
      if (event.pointerType !== 'touch') select(targetFor(event.target));
    });
    plot.addEventListener('pointerout', event => {
      if (event.pointerType !== 'touch') select(plot.contains(event.relatedTarget) ? targetFor(event.relatedTarget) : focused);
    });
    plot.addEventListener('focusin', event => { focused = targetFor(event.target); select(focused); });
    plot.addEventListener('focusout', () => { focused = null; select(null); });
    plot.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') select(targetFor(event.target));
    });
    plot.addEventListener('keydown', event => {
      if (event.key === 'Escape') { focused = null; select(null); }
    });
    document.addEventListener('pointerdown', event => {
      if (!plot.contains(event.target)) { focused = null; select(null); }
    });

    function render(nextWidth) {
      nextWidth = Math.max(280, Math.round(nextWidth));
      if (width === nextWidth) return;
      width = nextWidth; focused = null; select(null);
      const compact = width < 500;
      const left = compact ? 120 : 170;
      const right = 28;
      const top = 58;
      const spacing = compact ? 46 : 40;
      const height = top + (models.length - 1) * spacing + 28;
      const x = index => left + index * (width - left - right) / (epsilons.length - 1);
      const y = position => top + (position - 1) * spacing;
      const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': fallback.alt });
      svg.style.fontSize = `${compact ? 10 : 12}px`;
      epsilons.forEach((epsilon, index) => {
        svg.append(svgElement('line', { x1: x(index), x2: x(index), y1: 33, y2: height - 14, class: 'consistency-grid' }));
        svg.append(svgElement('text', { x: x(index), y: 20, 'text-anchor': 'middle', class: 'ranking-tolerance' }, `ε = ${epsilon.toFixed(2)}`));
      });
      // Draw every connector behind labels, so crossings never obscure scores.
      const glows = svgElement('g');
      const lines = svgElement('g');
      const marks = svgElement('g');
      models.forEach((model, index) => {
        const color = colors[index % colors.length];
        const points = epsilons.map(epsilon => rows.find(row => row.model === model && row.epsilon === epsilon));
        // Match the original SVG's band: ±0.15 display positions at 10% opacity.
        const upper = points.map((row, i) => `${x(i)} ${y(row.position) - spacing * 0.15}`);
        const lower = points.map((row, i) => `${x(i)} ${y(row.position) + spacing * 0.15}`).reverse();
        glows.append(svgElement('path', {
          d: `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`,
          fill: color, class: 'ranking-series ranking-glow', 'data-model': model,
          'aria-hidden': 'true',
        }));
        const lineGroup = svgElement('g', { class: 'ranking-series', 'data-model': model });
        const d = points.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(row.position)}`).join(' ');
        lineGroup.append(svgElement('path', { d, stroke: color, class: 'ranking-line' }));
        lineGroup.append(svgElement('path', { d, class: 'ranking-hit-line' }));
        lines.append(lineGroup);
        const group = svgElement('g', { class: 'ranking-series', 'data-model': model });
        const label = svgElement('text', { x: left - 14, y: y(points[0].position) + 4, 'text-anchor': 'end', class: 'ranking-model-name' });
        const name = names[model] || model;
        if (compact && name.length > 17) {
          const split = name.lastIndexOf(' ', 16);
          label.append(svgElement('tspan', { x: left - 14, dy: -5 }, name.slice(0, split)));
          label.append(svgElement('tspan', { x: left - 14, dy: 13 }, name.slice(split + 1)));
        } else label.textContent = name;
        group.append(label);
        points.forEach((row, i) => {
          const point = svgElement('g', {
            class: 'ranking-point', tabindex: '0', role: 'img',
            'data-model': model, 'data-epsilon': row.epsilon, 'data-score': row.score,
            'data-position': row.position, 'data-tied': row.tied,
            'aria-label': `${name}, tolerance ${row.epsilon.toFixed(2)}, score ${percent(row.score)}${row.tied ? ', tied score' : ''}, display position ${row.position}`,
          });
          point.append(svgElement('circle', { cx: x(i), cy: y(row.position), r: 4.5, fill: color, class: 'ranking-dot' }));
          point.append(svgElement('text', { x: x(i), y: y(row.position) - 11, 'text-anchor': 'middle', class: 'ranking-score' }, percent(row.score)));
          point.append(svgElement('circle', { cx: x(i), cy: y(row.position), r: 12, class: 'ranking-hit-point' }));
          group.append(point);
        });
        marks.append(group);
      });
      svg.append(glows, lines, marks);
      plot.replaceChildren(svg, tooltip);
    }
    render(figure.getBoundingClientRect().width);
    fallback.replaceWith(root);
    if (typeof ResizeObserver === 'function') new ResizeObserver(entries => render(entries[0].contentRect.width)).observe(root);
  }

  fetch(new URL('figures/self_consistency_rankings.csv', document.baseURI))
    .then(response => {
      if (!response.ok) throw new Error(`Ranking data request failed: ${response.status}`);
      return response.text();
    })
    .then(parseData)
    .then(mount)
    .catch(error => console.warn('Keeping the static ranking figure.', error));
})();
