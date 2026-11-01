/* 内置学科目录：一级学科 → 二级分类。三级分类不预置，来自题库数据与自定义输入。
   数据库等学科后期在此追加即可。 */
(function () {
  'use strict';
  App.catalog = {
    BUILT_IN: {
      'Java': ['java基础', 'java集合', 'java并发', 'IO', 'JVM调优', 'java8新特性', 'spring', '微服务'],
      'Python': ['Python基础', 'Python进阶', '框架与工程'],
      'Agent': ['基础概念', '框架工具', '评估与优化'],
      '数据库': ['redis', 'MongoDB', 'milvus', 'chrome'],
      '中间件': ['redis', 'rocketmq']
    }
  };
})();
