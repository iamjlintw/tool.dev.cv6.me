function generatePassword() {
    const lengthInput = document.getElementById('length');
    const length = lengthInput.value;
    const specialCharsAllowed = document.getElementById('specialChars').checked;

    // 檢查輸入
    if (!length || isNaN(length) || length < 1 || length > 64) {
        alert("請輸入有效的數字 (1-64)!");
        lengthInput.focus();
        return;
    }

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const special = "!@#$%^&*()_-+=<>?";

    let password = "";
    for (let i = 0; i < length; i++) {
        if (specialCharsAllowed && Math.random() < 0.2) {
            password += special.charAt(Math.floor(Math.random() * special.length));
        } else {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }

    document.getElementById('passwordOutput').value = password;
    evaluateStrength(password);
}


function evaluateStrength(password) {
    const strengthBox = document.getElementById('strengthBox');
    if (password.length < 8) {
        strengthBox.textContent = "弱";
        strengthBox.style.backgroundColor = "red";
    } else if (password.length < 16) {
        strengthBox.textContent = "中等";
        strengthBox.style.backgroundColor = "yellow";
    } else {
        strengthBox.textContent = "強";
        strengthBox.style.backgroundColor = "green";
    }
}


function copyPassword() {
    const passwordOutput = document.getElementById('passwordOutput');
    passwordOutput.select();
    document.execCommand('copy');
}
