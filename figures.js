(() => {
  'use strict';
  const figure = document.getElementById('main-result');
  const fallback = figure?.querySelector('img');
  if (!fallback) return;

  const series = [
    { label: 'Decision', file: 'overall_decision.json', colors: ['#94c4df', '#4191c6', '#0d57a1'] },
    { label: 'Other', file: 'overall_other.json', colors: ['#fda762', '#f16813', '#b03903'] },
  ];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const percent = score => `${(score * 100).toFixed(1)}%`;
  function svgElement(tag, attributes = {}, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function validate(data) {
    if (!data || !Array.isArray(data.models) || !data.models.length
        || !data.models.every(model => typeof model === 'string' && model.trim())
        || !Array.isArray(data.epsilons) || data.epsilons.length !== 3
        || !data.epsilons.every(epsilon => Number.isFinite(epsilon) && epsilon > 0)) {
      throw new Error('Invalid consistency chart models or tolerances.');
    }
    for (const epsilon of data.epsilons) {
      const scores = data.consistency_scores?.[String(epsilon)];
      if (!Array.isArray(scores) || scores.length !== data.models.length
          || !scores.every(score => Number.isFinite(score) && score >= 0 && score <= 1)) {
        throw new Error(`Invalid consistency scores for tolerance ${epsilon}.`);
      }
    }
    return data;
  }

  function mount(datasets) {
    const epsilons = datasets[0].epsilons;
    if (!datasets.every(data => data.epsilons.every((epsilon, index) => epsilon === epsilons[index]))) {
      throw new Error('Consistency chart datasets must use the same tolerances in the same order.');
    }
    const data = {
      epsilons,
      models: datasets.flatMap(dataset => dataset.models),
      consistency_scores: Object.fromEntries(epsilons.map(epsilon => [
        String(epsilon), datasets.flatMap(dataset => dataset.consistency_scores[String(epsilon)]),
      ])),
    };
    const modelGroups = datasets.flatMap((dataset, index) => dataset.models.map(() => index));
    const root = document.createElement('div');
    root.className = 'consistency-chart';
    const heading = document.createElement('div');
    heading.className = 'consistency-chart-heading';
    heading.textContent = 'Consistency Scores';
    const legend = document.createElement('div');
    legend.className = 'consistency-chart-legend';
    data.epsilons.forEach((epsilon, index) => {
      const item = document.createElement('div');
      item.className = 'consistency-legend-item';
      const swatches = document.createElement('span');
      swatches.className = 'consistency-legend-swatches';
      swatches.setAttribute('role', 'img');
      swatches.setAttribute('aria-label', 'Decision models (blue) and other LLMs (orange)');
      series.forEach(group => {
        const swatch = document.createElement('i');
        swatch.style.backgroundColor = group.colors[index];
        swatch.setAttribute('aria-hidden', 'true');
        swatches.append(swatch);
      });
      const label = document.createElement('span');
      if (window.katex) {
        window.katex.render(`\\varepsilon = ${epsilon.toFixed(2)}`, label, { throwOnError: false });
      } else {
        label.textContent = `ε = ${epsilon.toFixed(2)}`;
      }
      item.append(swatches, label);
      legend.append(item);
    });
    const plot = document.createElement('div');
    plot.className = 'consistency-chart-plot';
    const tooltip = document.createElement('div');
    tooltip.className = 'consistency-tooltip';
    tooltip.id = 'consistency-score-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    const tooltipModel = document.createElement('strong');
    const tooltipTolerance = document.createElement('span');
    const tooltipScore = document.createElement('span');
    tooltip.append(tooltipModel, tooltipTolerance, tooltipScore);

    // Numerical values remain available to screen readers, independently of motion.
    const table = document.createElement('table');
    table.className = 'visually-hidden';
    const caption = document.createElement('caption');
    caption.textContent = 'Split consistency scores by model and tolerance';
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    for (const label of ['Model', ...data.epsilons.map(e => `ε = ${e.toFixed(2)}`)]) {
      const cell = document.createElement('th');
      cell.setAttribute('scope', 'col');
      cell.textContent = label;
      header.append(cell);
    }
    head.append(header);
    const body = document.createElement('tbody');
    data.models.forEach((model, index) => {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.setAttribute('scope', 'row');
      name.textContent = model;
      row.append(name);
      for (const epsilon of data.epsilons) {
        const cell = document.createElement('td');
        cell.textContent = percent(data.consistency_scores[String(epsilon)][index]);
        row.append(cell);
      }
      body.append(row);
    });
    table.append(caption, head, body);
    root.append(heading, legend, plot, table);

    let revealed = false;
    let lastWidth = 0;
    let animations = [];
    let observer;
    let hoveredBar = null;
    let focusedBar = null;
    let tappedBar = null;

    function updateInteraction() {
      const active = hoveredBar || focusedBar || tappedBar;
      const modelIndex = active?.getAttribute('data-model-index');
      plot.classList.toggle('has-highlight', Boolean(active));
      for (const mark of plot.querySelectorAll('[data-model-index]')) {
        mark.classList.toggle('is-highlighted', Boolean(active) && mark.getAttribute('data-model-index') === modelIndex);
        if (mark.classList.contains('consistency-bar')) {
          mark.classList.toggle('is-active', mark === active);
          if (mark === active) mark.setAttribute('aria-describedby', tooltip.id);
          else mark.removeAttribute('aria-describedby');
        }
      }
      tooltip.hidden = !active;
      if (!active) return;
      const score = Number(active.getAttribute('data-score'));
      tooltipModel.textContent = active.getAttribute('data-model');
      const epsilon = Number(active.getAttribute('data-epsilon')).toFixed(2);
      if (window.katex) {
        window.katex.render(`\\varepsilon = ${epsilon}`, tooltipTolerance, { throwOnError: false });
      } else {
        tooltipTolerance.textContent = `ε = ${epsilon}`;
      }
      tooltipScore.textContent = `Score = ${percent(score)}`;
      const bounds = plot.getBoundingClientRect();
      const barBounds = active.getBoundingClientRect();
      const center = barBounds.left - bounds.left + barBounds.width / 2;
      const maxLeft = Math.max(0, bounds.width - tooltip.offsetWidth);
      tooltip.style.left = `${Math.max(0, Math.min(maxLeft, center - tooltip.offsetWidth / 2))}px`;
      const above = barBounds.top - bounds.top - tooltip.offsetHeight - 10;
      tooltip.style.top = `${above >= 0 ? above : barBounds.top - bounds.top + 14}px`;
    }

    function clearInteraction() {
      hoveredBar = focusedBar = tappedBar = null;
      updateInteraction();
    }

    plot.addEventListener('keydown', event => {
      if (event.key === 'Escape') clearInteraction();
    });
    document.addEventListener('pointerdown', event => {
      if (!plot.contains(event.target)) clearInteraction();
    });

    function render(width) {
      width = Math.max(280, Math.round(width));
      if (width === lastWidth) return;
      clearInteraction();
      lastWidth = width;
      animations.forEach(animation => animation.cancel());
      animations = [];
      const compact = width < 500;
      root.classList.toggle('is-compact', compact);
      const fontSize = compact ? 11 : 13;
      const left = compact ? 47 : 57;
      const right = 8;
      const top = 16;
      const plotHeight = Math.max(220, Math.min(360, width * 0.48));
      const bottom = top + plotHeight;
      const labelSpace = Math.max(...data.models.map(model => model.length)) * fontSize * 0.62 + 16;
      const height = bottom + labelSpace;
      const svg = svgElement('svg', {
        viewBox: `0 0 ${width} ${height}`, width, height,
        role: 'group', 'aria-label': fallback.alt,
      });
      svg.style.fontSize = `${fontSize}px`;
      for (let tick = 0; tick <= 5; tick++) {
        const score = tick / 5;
        const y = bottom - score * plotHeight;
        svg.append(svgElement('line', {
          x1: left, x2: width - right, y1: y, y2: y,
          class: tick === 0 ? 'consistency-axis' : 'consistency-grid',
        }));
        svg.append(svgElement('text', { x: left - 9, y: y + 4, 'text-anchor': 'end' }, score.toFixed(1)));
      }
      svg.append(svgElement('text', {
        transform: `translate(13 ${top + plotHeight / 2}) rotate(-90)`, 'text-anchor': 'middle',
      }, 'Split Consistency Score'));
      svg.append(svgElement('rect', {
        x: left, y: top, width: width - left - right, height: plotHeight,
        fill: 'none', class: 'consistency-axis',
      }));
      // Keep the outer padding and reduce the visible gap between groups by about 30%.
      const groupGap = 0.6;
      const groupWidth = (width - left - right) / (data.models.length + (series.length - 1) * groupGap + 0.925);
      const barWidth = groupWidth * 0.25;
      data.models.forEach((model, modelIndex) => {
        const groupIndex = modelGroups[modelIndex];
        const center = left + (modelIndex + groupIndex * groupGap + 0.9625) * groupWidth;
        data.epsilons.forEach((epsilon, seriesIndex) => {
          const score = data.consistency_scores[String(epsilon)][modelIndex];
          const bar = svgElement('rect', {
            x: center + (seriesIndex - 1.5) * barWidth,
            y: bottom - score * plotHeight, width: barWidth, height: score * plotHeight,
            fill: series[groupIndex].colors[seriesIndex], class: 'consistency-bar',
            'data-model': model, 'data-epsilon': epsilon, 'data-score': score,
            'data-model-index': modelIndex, tabindex: '0', role: 'img',
            'aria-label': `${model}, tolerance ${epsilon.toFixed(2)}, score ${score} (${percent(score)})`,
          });
          bar.style.transformBox = 'view-box';
          bar.style.transformOrigin = `0px ${bottom}px`;
          bar.style.transform = revealed ? 'none' : 'scaleY(0)';
          bar.addEventListener('pointerenter', event => {
            if (event.pointerType === 'touch') return;
            hoveredBar = bar;
            updateInteraction();
          });
          bar.addEventListener('pointerleave', event => {
            if (event.pointerType === 'touch') return;
            hoveredBar = null;
            updateInteraction();
          });
          bar.addEventListener('focus', () => {
            focusedBar = bar;
            updateInteraction();
          });
          bar.addEventListener('blur', () => {
            focusedBar = null;
            updateInteraction();
          });
          bar.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch') return;
            tappedBar = bar;
            hoveredBar = focusedBar = null;
            updateInteraction();
          });
          svg.append(bar);
        });
        svg.append(svgElement('text', {
          transform: `translate(${center + fontSize * 0.3} ${bottom + 11}) rotate(-90)`, 'text-anchor': 'end',
          'data-model-index': modelIndex, class: 'consistency-model-label',
        }, model));
      });
      plot.replaceChildren(svg, tooltip);
    }

    function reveal() {
      if (revealed) return;
      revealed = true;
      observer?.disconnect();
      for (const bar of plot.querySelectorAll('.consistency-bar')) {
        bar.style.transform = 'none';
        if (!motion.matches && typeof bar.animate === 'function') {
          animations.push(bar.animate(
            [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
            { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          ));
        }
      }
    }

    // Build successfully before replacing the static image.
    render(figure.getBoundingClientRect().width);
    fallback.replaceWith(root);
    if (motion.matches || typeof IntersectionObserver !== 'function') reveal();
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.15)) reveal();
      }, { threshold: 0.15 });
      observer.observe(plot);
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(entries => render(entries[0].contentRect.width)).observe(root);
    }
    motion.addEventListener('change', () => {
      if (motion.matches) {
        reveal();
        animations.forEach(animation => animation.finish());
      }
    });
  }

  Promise.all(series.map(group =>
    fetch(new URL(`figures/${group.file}`, document.baseURI))
      .then(response => {
        if (!response.ok) throw new Error(`Chart data request failed: ${response.status}`);
        return response.json();
      })
      .then(validate)))
    .then(mount)
    .catch(error => console.warn('Keeping the static consistency figure.', error));
})();
