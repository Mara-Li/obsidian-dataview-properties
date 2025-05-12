---
title: DV Html Lists
---

to_export_list:: `="<ul>" + join(map(["1", "Hello", "somethings"], (x) => "<li>" + x + "</li>"), "") + "</ul>"`
