(() => {
    // 点击计数功能
    function incrementCounter(button, index = 0) {
        const wrapper = button.closest('.sub-category') || button.closest('.option-group');
        const inputs = wrapper.querySelectorAll('input[type="number"]');

        if (inputs.length > index) {
            const input = inputs[index];
            input.value = parseInt(input.value) + 1;
            input.dispatchEvent(new Event('input'));
        }
    }

    // 计算总分功能
    function calculate() {
        let total = 0;
        document.getElementById('freshcup-tool').querySelectorAll('input[type="number"]').forEach(input => {
            total += (parseInt(input.value) || 0) * parseInt(input.dataset.score);
        });

        const totalElement = document.getElementById('total');
        totalElement.textContent = total;
        totalElement.style.color = total >= 0 ? '#2a611e' : '#a32121';
    }

    // 更新所有input的data-score值
    function updateScores(categoryElement, multiplier = 1) {
        categoryElement.querySelectorAll('input[type="number"]').forEach(input => {
            if (!input.dataset.originalScore) {
                input.dataset.originalScore = input.dataset.score; // 保存原始值
            }
            const originalScore = parseInt(input.dataset.originalScore);
            input.dataset.score = Math.round(originalScore * multiplier);
        });
    }

    // 切换分数模式
    function toggleScoreMultiplier(event) {
        const multiplierToggle = event.target;
        const category = multiplierToggle.closest('.category'); // 只获取当前开关所在的分类
        const multiplier = multiplierToggle.checked ? 1.5 : 1;

        updateScores(category, multiplier);
        calculate(); // 全局重新计算总分
    }

    // 初始化
    function initializeScores() {
        // 为所有输入添加事件监听
        document.getElementById('freshcup-tool').querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('input', calculate);
        });

        // 为切换开关添加事件监听
        document.getElementById('freshcup-tool').querySelectorAll('#multiplierToggle').forEach(toggle => {
            toggle.addEventListener('change', toggleScoreMultiplier);

            // 初始化当前 toggle 所在 category 的分数
            const category = toggle.closest('.category');
            updateScores(category, 1);
        });
    }

    initializeScores();

    // 创建打印按钮
    const printBtn = document.createElement('button');
    printBtn.textContent = '打印成绩单';
    printBtn.style.marginTop = '20px';
    printBtn.style.backgroundColor = '#4CAF50';
    document.getElementById('freshcup-tool').querySelector('.calculator').appendChild(printBtn);

    // 创建成绩单显示区域
    const reportDiv = document.createElement('div');
    reportDiv.id = 'score-report';
    reportDiv.style.marginTop = '20px';
    reportDiv.style.padding = '15px';
    reportDiv.style.backgroundColor = '#f5f5f5';
    reportDiv.style.borderRadius = '8px';
    document.getElementById('freshcup-tool').querySelector('.calculator').appendChild(reportDiv);

    // 打印成绩单功能
    printBtn.addEventListener('click', function() {
        const reportData = [];

        // 收集所有非零数据
        document.getElementById('freshcup-tool').querySelectorAll('.category').forEach(category => {
            const categoryTitle = category.querySelector('h2').textContent;
            const items = [];

            category.querySelectorAll('.sub-category').forEach(subCategory => {
                const inputs = subCategory.querySelectorAll('input[type="number"]');
                const label = subCategory.querySelector('.clickable-label')?.textContent ||
                    subCategory.querySelector('label')?.textContent || '';

                // 特殊处理"局内结算分"
                if (label.includes('局内结算分')) {
                    const value = parseInt(inputs[0].value);
                    if(value > 0) {
                        items.push({
                            name: label,
                            count: '', // 不显示次数
                            score: '', // 不显示单次分数
                            total: value * parseInt(inputs[0].dataset.score),
                            isSpecial: true
                        });
                    }
                }
                // 处理普通单项
                else if(inputs.length === 1) {
                    const value = parseInt(inputs[0].value);
                    if(value > 0) {
                        items.push({
                            name: label.replace(/（.+）/, '').trim(),
                            count: value,
                            score: parseInt(inputs[0].dataset.score),
                            total: value * parseInt(inputs[0].dataset.score),
                            hasOptions: false
                        });
                    }
                }
                // 处理有子选项的项
                else if(inputs.length > 1) {
                    const subOptions = [];
                    let subTotal = 0;

                    // 收集选项名称和值
                    const optionHeaders = subCategory.querySelectorAll('.option-header button');
                    optionHeaders.forEach((header, i) => {
                        if(i < inputs.length) {
                            const val = parseInt(inputs[i].value);
                            const score = parseInt(inputs[i].dataset.score);
                            if(val > 0) {
                                const optionTotal = val * score;
                                subOptions.push({
                                    name: header.textContent,
                                    value: val,
                                    score: score,
                                    total: optionTotal
                                });
                                subTotal += optionTotal;
                            }
                        }
                    });

                    if(subOptions.length > 0) {
                        items.push({
                            name: label,
                            count: '', // 不显示次数
                            score: '', // 不显示单次分数
                            total: subTotal,
                            hasOptions: true,
                            options: subOptions
                        });
                    }
                }
            });

            if(items.length > 0) {
                reportData.push({
                    category: categoryTitle,
                    items: items
                });
            }
        });

        // 生成报告HTML
        let reportHTML = '<h3>成绩单</h3><table style="width:100%;border-collapse:collapse;">';
        reportHTML += '<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">项目</th>' +
            '<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">次数</th>' +
            '<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">单次分数</th>' +
            '<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">小计</th></tr>';

        reportData.forEach(section => {
            reportHTML += `<tr><td colspan="4" style="padding:8px;font-weight:bold;background-color:#e0e0e0;">${section.category}</td></tr>`;

            section.items.forEach(item => {
                // 主项目行
                reportHTML += `<tr>
                    <td style="padding:8px;border-bottom:1px solid #eee;">${item.name}</td>
                    <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${item.count}</td>
                    <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${item.score}</td>
                    <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${item.total}</td>
                </tr>`;

                // 子选项行
                if(item.hasOptions && item.options.length > 0) {
                    item.options.forEach(opt => {
                        reportHTML += `<tr>
                            <td style="padding:8px 8px 8px 30px;border-bottom:1px solid #eee;font-size:0.9em;color:#666;">
                                <span style="font-size:0.8em;vertical-align:sub;">${opt.name}</span>
                            </td>
                            <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;font-size:0.9em;color:#666;">${opt.value}</td>
                            <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;font-size:0.9em;color:#666;">${opt.score}</td>
                            <td style="text-align:right;padding:8px;border-bottom:1px solid #eee;font-size:0.9em;color:#666;">${opt.total}</td>
                        </tr>`;
                    });
                }
            });
        });

        // 添加总分
        const totalScore = parseInt(document.getElementById('total').textContent);
        reportHTML += `<tr>
            <td colspan="3" style="padding:8px;font-weight:bold;text-align:right;border-top:2px solid #ddd;">总分</td>
            <td style="text-align:right;padding:8px;font-weight:bold;border-top:2px solid #ddd;">${totalScore}</td>
        </tr>`;

        reportHTML += '</table>';
        reportDiv.innerHTML = reportHTML;
    });

    window.incrementCounter = incrementCounter;
})();
