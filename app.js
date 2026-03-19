alert("app.js 有載入");
console.log("app.js 有載入");

document.addEventListener("DOMContentLoaded", function () {
  alert("DOM 已載入");

  const loginForm = document.getElementById("login-form");

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    alert("你按了登入");
  });
});
