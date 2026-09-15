(() => {
    function initializeScores() {
        document.getElementById('freshcup-tool').querySelectorAll('input.score-input').forEach(input => {
            input.addEventListener('input', calculate);
            updateScoreDisplay(input);
        });
        calculate();
    }

    function updateScoreDisplay(input) {
        const displaySpan = input.parentElement.querySelector('.score-display');
        if(displaySpan) {
            const score = parseInt(input.dataset.score);
            if (score > 0) displaySpan.textContent = `(+${score})`;
            else if (score < 0) displaySpan.textContent = `(${score})`;
            else displaySpan.textContent = `(0)`;
        }
    }

    function incrementCounter(button) {
        const input = button.parentElement.querySelector('input[type="number"]');
        if (input) {
            input.value = parseInt(input.value || 0) + 1;
            input.dispatchEvent(new Event('input'));
        }
    }

    function calculate() {
        let total = 0;
        document.getElementById('freshcup-tool').querySelectorAll('input.score-input').forEach(input => {
            const count = parseInt(input.value) || 0;
            const score = parseInt(input.dataset.score) || 0;
            total += count * score;
        });

        const totalElement = document.getElementById('total');
        totalElement.textContent = `总计个人得分: ${total}`;
        totalElement.style.color = total >= 0 ? '#2a611e' : '#d32f2f';
    }

    document.getElementById('printBtn').addEventListener('click', function() {
        const reportDiv = document.getElementById('score-report');
        let reportHTML = `<h3 style="margin-top:0;">个人成绩单</h3><table style="width:100%;border-collapse:collapse;">`;
        reportHTML += '<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">项目</th>' +
            '<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">次数</th>' +
            '<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">单次分数</th>' +
            '<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">小计</th></tr>';

        document.getElementById('freshcup-tool').querySelectorAll('.category').forEach(category => {
            let sectionHasItems = false;
            let sectionHTML = `<tr><td colspan="4" style="padding:8px;font-weight:bold;background-color:#e0e0e0;">${category.querySelector('h2').textContent.split('(')[0]}</td></tr>`;

            category.querySelectorAll('.sub-category').forEach(subCategory => {
                const input = subCategory.querySelector('input[type="number"]');
                const labelElement = subCategory.querySelector('.clickable-label');
                if(!input || !labelElement) return;

                const value = parseInt(input.value) || 0;
                if(value > 0) {
                    sectionHasItems = true;
                    // Remove citation brackets and dynamic score parts from printed label
                    let rawName = labelElement.textContent.replace(/\([+-]?\d+\)/g, '').trim();
                    const score = parseInt(input.dataset.score);
                    const subTotal = value * score;

                    sectionHTML += `<tr>
                        <td style="padding:8px;border-bottom:1px solid #eee;">${rawName}</td>
                        <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${value}</td>
                        <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${score}</td>
                        <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${subTotal}</td>
                    </tr>`;
                }
            });
            if(sectionHasItems) {
                reportHTML += sectionHTML;
            }
        });

        const totalScore = document.getElementById('total').textContent.replace('总计个人得分: ', '');
        reportHTML += `<tr>
            <td colspan="3" style="padding:8px;font-weight:bold;text-align:right;border-top:2px solid #ddd;">个人结算分</td>
            <td style="text-align:right;padding:8px;font-weight:bold;border-top:2px solid #ddd;color:${parseInt(totalScore)>=0?'#2a611e':'#d32f2f'}">${totalScore}</td>
        </tr>`;

        reportHTML += '</table>';
        reportDiv.innerHTML = reportHTML;
        reportDiv.style.display = 'block';
    });

    window.incrementCounter = incrementCounter;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeScores, { once: true });
    else initializeScores();
})();
