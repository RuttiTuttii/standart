Отлично, вот полный HTML-документ с чистыми схемами (структуры и алгоритм), который можно открыть в любом браузере, включая старые версии (поддержка с 2014–2015). Для удобства я оформил всё в одном файле, чтобы вы могли скопировать код, сохранить как .html и открыть. Схемы выполнены с использованием блочных элементов, стрелок и таблиц — без сложных CSS Grid или Flex (использованы простые inline-block и flex с базовыми свойствами, которые работают в IE11).

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Схемы систем сертификации СЗИ</title>
    <style>
        body {
            font-family: 'Segoe UI', 'Arial', sans-serif;
            margin: 40px;
            background: #fff;
            color: #000;
        }
        h1, h2, h3 {
            text-align: center;
        }
        .scheme {
            margin: 40px auto;
            text-align: center;
            background: #f9f9f9;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 8px;
            max-width: 800px;
        }
        .node {
            display: inline-block;
            border: 1px solid #333;
            background: #fff;
            padding: 10px 20px;
            margin: 5px;
            font-weight: bold;
            min-width: 180px;
        }
        .node.small {
            min-width: 140px;
        }
        .level {
            text-align: center;
            margin: 10px 0;
        }
        .arrow-down {
            font-size: 24px;
            margin: 0 auto;
            display: block;
            width: 24px;
        }
        .flex-row {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            gap: 40px;
            flex-wrap: wrap;
        }
        .flex-col {
            text-align: center;
        }
        .table-container {
            margin: 40px auto;
            max-width: 100%;
            overflow-x: auto;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
            font-size: 14px;
        }
        th, td {
            border: 1px solid #000;
            padding: 8px;
            vertical-align: top;
        }
        th {
            background-color: #eee;
            font-weight: bold;
        }
        .caption {
            font-weight: bold;
            margin-bottom: 10px;
            text-align: center;
        }
    </style>
</head>
<body>

<h1>Схемы организационной структуры систем сертификации СЗИ</h1>

<!-- Схема 1: ФСТЭК -->
<div class="scheme">
    <h2>Система сертификации ФСТЭК России</h2>
    <div class="level">
        <div class="node">ФСТЭК России<br>(федеральный орган)</div>
    </div>
    <div class="arrow-down">▼</div>
    <div class="flex-row">
        <div class="flex-col">
            <div class="node small">Органы по сертификации</div>
        </div>
        <div class="flex-col">
            <div class="node small">Испытательные лаборатории</div>
        </div>
    </div>
    <div class="arrow-down" style="margin-top: 10px;">▼</div>
    <div class="level">
        <div class="node">Заявители (изготовители)</div>
    </div>
</div>

<!-- Схема 2: Минобороны -->
<div class="scheme">
    <h2>Система сертификации Минобороны России</h2>
    <div class="level">
        <div class="node">Министерство обороны РФ<br>(Восьмое управление ГШ)<br>– федеральный орган</div>
    </div>
    <div class="arrow-down">▼</div>
    <div class="flex-row">
        <div class="flex-col">
            <div class="node small">Органы по сертификации</div>
        </div>
        <div class="flex-col">
            <div class="node small">Испытательные лаборатории</div>
        </div>
    </div>
    <div class="arrow-down" style="margin-top: 10px;">▼</div>
    <div class="level">
        <div class="node">Заявители (изготовители)</div>
    </div>
</div>

<!-- Схема 3: ФСБ -->
<div class="scheme">
    <h2>Система сертификации ФСБ России (СЗИ – ГТ)</h2>
    <div class="level">
        <div class="node">ФСБ России<br>(федеральный орган)</div>
    </div>
    <div class="arrow-down">▼</div>
    <div class="flex-row">
        <div class="flex-col">
            <div class="node small">Центральный орган</div>
        </div>
        <div class="flex-col">
            <div class="node small">Учебно-методический центр</div>
        </div>
    </div>
    <div class="arrow-down" style="margin-top: 10px;">▼</div>
    <div class="flex-row">
        <div class="flex-col">
            <div class="node small">Органы по сертификации</div>
        </div>
        <div class="flex-col">
            <div class="node small">Испытательные центры (лаборатории)</div>
        </div>
    </div>
    <div class="arrow-down" style="margin-top: 10px;">▼</div>
    <div class="level">
        <div class="node">Заявители (разработчики, изготовители, продавцы, потребители)</div>
    </div>
</div>

<!-- Схема алгоритма -->
<div class="scheme">
    <h2>Порядок проведения сертификации (ФСТЭК) – алгоритм</h2>
    <div class="level"><div class="node">Подача заявки на сертификацию (заявитель → ФСТЭК)</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Рассмотрение заявки ФСТЭК (15 календарных дней)</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Принятие решения о проведении сертификации / отказ</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Отбор образцов и разработка программы и методик испытаний (испытательная лаборатория)</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Утверждение программы и методик органом по сертификации</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Проведение сертификационных испытаний (испытательная лаборатория)</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Оформление технического заключения и протоколов</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Оценка материалов органом по сертификации, экспертное заключение</div></div>
    <div class="arrow-down">▼</div>
    <div class="level"><div class="node">Принятие решения ФСТЭК о выдаче сертификата соответствия</div></div>
</div>

<!-- Таблица сравнительного анализа -->
<div class="table-container">
    <div class="caption">Сравнительный анализ систем сертификации СЗИ</div>
    <table>
        <thead>
            <tr><th>Критерий</th><th>ФСТЭК России</th><th>Минобороны России</th><th>ФСБ России (СЗИ – ГТ)</th></tr>
        </thead>
        <tbody>
            <tr><td>Нормативный документ</td><td>Приказ ФСТЭК № 55 от 03.04.2018</td><td>Приказ Министра обороны № 488 от 29.09.2020</td><td>Приказ ФСБ № 564 от 13.11.1999</td></tr>
            <tr><td>Федеральный орган</td><td>ФСТЭК России</td><td>Министерство обороны (Восьмое управление ГШ)</td><td>ФСБ России</td></tr>
            <tr><td>Объекты сертификации</td><td>Средства противодействия техническим разведкам, средства технической защиты информации, средства обеспечения безопасности ИТ, защищённые средства обработки информации</td><td>Технические, программно-технические, программные средства защиты информации, защищённые программные средства, информационные системы, средства контроля эффективности защиты</td><td>Технические средства защиты (от перехвата, НСД), программные средства, защищённые программные средства, программно-технические средства, специальные средства</td></tr>
            <tr><td>Схемы сертификации</td><td>3 схемы: для единичного образца, для партии, для серийного производства</td><td>Для единичных образцов/партии – испытания; для серийного – испытания типовых образцов + предварительная проверка производства</td><td>Схемы 1–8, включая испытания типа, анализ состояния производства, инспекционный контроль (схемы 3, 3а, 8 наиболее характерны)</td></tr>
            <tr><td>Срок действия сертификата</td><td>До 5 лет (для серийного); для единичного/партии срок не устанавливается</td><td>Не более 5 лет</td><td>Не более 5 лет</td></tr>
            <tr><td>Инспекционный контроль</td><td>Проводится органом по сертификации, может включать испытания, проверку производства и технической поддержки</td><td>Проводится органом по сертификации, периодичность устанавливается в нормативных документах</td><td>Проводится органом по сертификации, возможны испытания образцов, анализ состояния производства</td></tr>
            <tr><td>Знак соответствия</td><td>Идентификатор вида РОСС RU.01.XXXXX.XXXXXX</td><td>Сертификат соответствия с указанием идентификационных характеристик</td><td>Установлены формы знаков соответствия для обязательной и добровольной сертификации</td></tr>
            <tr><td>Особенности</td><td>Наличие процедур проверки организации технической поддержки, безопасной разработки ПО, маркировка каждого образца</td><td>Упор на сертификацию средств, применяемых в Вооружённых Силах, наличие военных представительств</td><td>Строгая ориентация на защиту государственной тайны, наличие учебно-методического центра, возможность добровольной сертификации</td></tr>
        </tbody>
    </table>
</div>

</body>
</html>
```

Сохраните этот код в файл, например schemes.html, откройте в браузере и сделайте скриншоты нужных элементов или скопируйте их в отчёт (можно распечатать в PDF). HTML адаптирован для старых браузеров (Internet Explorer 11 и подобные), так что проблем быть не должно.