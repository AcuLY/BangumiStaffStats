// 超合金组件脚本
let isUserPage = window.location.href.match(/\/user\/(.*)$/i);
if (isUserPage) {
    let userId = isUserPage[1];
    let link = document.createElement('li');
    let href = `http://search.bgmss.fun?user=` + userId;
    link.innerHTML = "<span class=\"service\" style=\"background-color:#FF4573;\">BangumiStaffStats</span> <a href=\"" + href + "\" target=\"_blank\" class=\"l\" rel=\"me\">Staff \u6570\u636e\u7edf\u8ba1</a>"
    $('ul.network_service').append(link);
}