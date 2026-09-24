"use strict";
/* تغليف بسيط لمسارات Express 4 غير المتزامنة: أي رفض يُمرَّر إلى next(e)
 * فيلتقطه معالج الأخطاء المركزي بدل أن يعلّق الطلب. */
function ah(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { ah };
