// SEU 生存指南 2.0 - 阅读站点应用
(function() {
  'use strict';

  // 配置 marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      gfm: true,
      breaks: false,
      headerIds: true,
      mangle: false,
    });
    // 自定义 renderer：相对路径
    const renderer = new marked.Renderer();
    const origImage = renderer.image.bind(renderer);
    renderer.image = function(href, title, text) {
      // GitHub Pages 站点根相对路径
      return origImage(href, title, text);
    };
    marked.use({ renderer });
  }

  const state = {
    articles: [],
    tree: null,
    currentPath: null,
  };

  // DOM
  const $toc = document.getElementById('toc');
  const $article = document.getElementById('article');
  const $search = document.getElementById('search');
  const $breadcrumbs = document.getElementById('breadcrumbs');
  const $rawLink = document.getElementById('rawLink');
  const $menuToggle = document.getElementById('menuToggle');
  const $sidebar = document.getElementById('sidebar');
  const $startReadingBtn = document.getElementById('startReadingBtn');

  // 加载数据
  async function loadData() {
    try {
      const r = await fetch('articles_index.json');
      state.articles = await r.json();
    } catch (e) {
      console.error('Failed to load articles index', e);
    }
  }

  // 构建树形目录
  function buildToc() {
    const grouped = {};
    state.articles.forEach(a => {
      const path = a.path;  // e.g. ['观点篇', '1 认识']
      let cur = grouped;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!cur[key]) cur[key] = { __children: {}, __articles: [] };
        cur = cur[key].__children;
      }
      const leaf = path[path.length - 1] || '(根)';
      if (!cur[leaf]) cur[leaf] = { __children: {}, __articles: [] };
      cur[leaf].__articles.push(a);
    });

    function renderGroup(node, depth) {
      const keys = Object.keys(node);
      let html = '<ul>';
      keys.sort((a, b) => {
        const ai = node[a].__articles[0];
        const bi = node[b].__articles[0];
        if (ai && bi) {
          // 按原文顺序
          return state.articles.indexOf(ai) - state.articles.indexOf(bi);
        }
        return 0;
      });
      keys.forEach(k => {
        const sub = node[k];
        const articles = sub.__articles;
        if (articles.length === 1 && Object.keys(sub.__children).length === 0) {
          // 叶子
          const a = articles[0];
          html += `<li class="leaf" data-title="${escapeAttr(a.title)}" data-excerpt="${escapeAttr(a.excerpt)}" data-path="${escapeAttr(a.web_path)}"><a href="#${encodeURIComponent(a.web_path)}" data-path="${escapeAttr(a.web_path)}">${escapeHtml(a.title)}</a></li>`;
        } else if (articles.length > 0) {
          // group 本身也是文章（少数情况）
          const a = articles[0];
          html += `<li class="group" data-title="${escapeAttr(a.title)}" data-excerpt="${escapeAttr(a.excerpt)}">`;
          html += `<span class="group-label" data-path="${escapeAttr(a.web_path)}">${escapeHtml(a.title)}</span>`;
          html += `<ul>${renderGroup(sub.__children, depth + 1)}</ul>`;
          html += `</li>`;
        } else {
          // 纯分组
          html += `<li class="group">`;
          html += `<span class="group-label">${escapeHtml(k)}</span>`;
          html += `<ul>${renderGroup(sub.__children, depth + 1)}</ul>`;
          html += `</li>`;
        }
      });
      html += '</ul>';
      return html;
    }

    $toc.innerHTML = renderGroup(grouped, 0);

    // 绑定点击
    $toc.addEventListener('click', e => {
      const target = e.target.closest('a, .group-label');
      if (!target) return;
      const path = target.getAttribute('data-path');
      if (path) {
        e.preventDefault();
        loadArticle(path);
        history.pushState({ path }, '', '#' + encodeURIComponent(path));
        // 关闭移动菜单
        $sidebar.classList.remove('open');
      } else if (target.classList.contains('group-label')) {
        // 折叠/展开
        const group = target.parentElement;
        group.classList.toggle('collapsed');
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // 加载文章
  const cache = {};
  async function loadArticle(path) {
    state.currentPath = path;
    $article.innerHTML = '<div class="loading">加载中…</div>';
    $article.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 高亮目录
    document.querySelectorAll('#toc .leaf').forEach(li => {
      li.classList.toggle('active', li.getAttribute('data-path') === path);
    });

    // 加载 markdown
    let md;
    if (cache[path]) {
      md = cache[path];
    } else {
      try {
        const r = await fetch(path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        md = await r.text();
        cache[path] = md;
      } catch (e) {
        $article.innerHTML = `<div class="welcome"><h1>😢 加载失败</h1><p>无法加载文章：${escapeHtml(path)}</p><p>${escapeHtml(e.message)}</p></div>`;
        return;
      }
    }

    // 渲染
    const html = marked.parse(md);
    $article.innerHTML = html;

    // 给所有标题加上 anchor
    $article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
      if (!h.id) {
        h.id = h.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '');
      }
    });

    // 显示面包屑
    updateBreadcrumbs(path);

    // 更新 GitHub 原始链接
    $rawLink.href = 'https://github.com/IF-Link-Tech-Team/seu-survival-guide-2.0/blob/main/' + decodeURIComponent(path);

    // 隐藏欢迎页
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.remove();
  }

  function updateBreadcrumbs(path) {
    const article = state.articles.find(a => a.web_path === path);
    if (!article) {
      $breadcrumbs.innerHTML = '';
      return;
    }
    let html = '<a href="#">首页</a>';
    article.path.forEach((p, i) => {
      html += '<span class="sep">/</span>';
      if (i < article.path.length - 1) {
        html += `<span>${escapeHtml(p)}</span>`;
      } else {
        html += `<strong>${escapeHtml(p)}</strong>`;
      }
    });
    $breadcrumbs.innerHTML = html;
  }

  // 搜索
  function setupSearch() {
    let timer;
    $search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(applyFilter, 100);
    });
  }

  function applyFilter() {
    const q = $search.value.trim().toLowerCase();
    document.querySelectorAll('#toc li').forEach(li => {
      const title = (li.getAttribute('data-title') || li.textContent).toLowerCase();
      const excerpt = (li.getAttribute('data-excerpt') || '').toLowerCase();
      const match = !q || title.includes(q) || excerpt.includes(q);
      li.classList.toggle('hidden', !match);
    });
    // 自动展开所有包含匹配的 group
    if (q) {
      document.querySelectorAll('#toc li.group').forEach(g => {
        g.classList.remove('collapsed');
      });
    }
  }

  // 移动端菜单
  function setupMobileMenu() {
    $menuToggle.addEventListener('click', () => {
      $sidebar.classList.toggle('open');
    });
  }

  // 启动
  async function start() {
    await loadData();
    buildToc();
    setupSearch();
    setupMobileMenu();
    // 处理 URL hash
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash && state.articles.find(a => a.web_path === hash)) {
      loadArticle(hash);
    }
    if ($startReadingBtn) {
      $startReadingBtn.addEventListener('click', () => {
        if (state.articles.length) loadArticle(state.articles[0].web_path);
      });
    }
    window.addEventListener('popstate', e => {
      const path = e.state && e.state.path;
      if (path) loadArticle(path);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
