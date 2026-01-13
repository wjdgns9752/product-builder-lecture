const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

// Check for saved user preference, if any, on load of the website
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
  body.classList.add('dark-mode');
}

themeToggleBtn.addEventListener('click', () => {
  body.classList.toggle('dark-mode');

  let theme = 'light';
  if (body.classList.contains('dark-mode')) {
    theme = 'dark';
  }
  localStorage.setItem('theme', theme);
});
