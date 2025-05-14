---
title: DV Html Lists
dv_to_export_list:
  - "1"
  - Hello
  - somethings
---

to_export_list:: `="<ul>" + join(map(["1", "Hello", "somethings"], (x) => "<li>" + x + "</li>"), "") + "</ul>"`
