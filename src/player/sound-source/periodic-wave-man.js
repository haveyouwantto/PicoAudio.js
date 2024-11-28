const instrumentData = 'IP3/4tvNn9zv6tO3nL3Y18Cmkqi7wbGqiqyuppyfhaeeIPP/6Pnz4PHs193dntnHv8GztL6jsrSObomJXKxulJCEIPz/wbHm5ta74OvtxOTf66/VxdGg0MLBlpy8q6+ajaiIIP/97cG5a6lvhpeYm3pxi4uIWm99hm1IaGxpY2RdXWRnIP/+7dOsn56bl5WSj42LiYiGhq2En3x7e3t5eXd2dXV0IP/p3cKYlpeUk5fWndWHfHl2dXN0cGmrh7pIWmFgZWNjIOn83Mb/3P/M/abvz/v29Ln04eGr6PC2sMff0bfR78eUIP/h6Nbd4ujZyeTp48rYy7m1lq+BsJ+jrausmLq6t3q9IP/Ar6SelrmUkIyKhoSCgH59e3l4h3RzcnFwb4RsbWtrIP/DrJmCw9nVybGrq7Lrm9t/a3+MqKmmqoR3e3rBdsmGIP/Ar6SdramRkIyKh4mhent7eXh3eHRzcnFwb3VsbGtrIP/Iv/WbcmVoa2xvcneF14ZyaWNgXWBWV1RTU1BPUFFNIP/AtOB+hoeDhofAVWdnoWqcN7+AdXBua2lqaGdnZWFmIP/DsKeil5SZkI2MioF/gX98e4l2bXZ1c3Nub3NubWxsIO7HyMPC/7f8x83JrdB+2KWVk56SkZ+Ih4aGhYWBgoCCIOz2//va09zgwL+wzNqxyrO4u7fEpqWhoKeSjKB3h3uLIP/u2f615Z/dsa2r0I+Yk6yTlJCSjpKOpoSIhYOEgYJ9INf/x7akop+bl5SRj42KiYeFg4KAf318e3p5eHd3dnRzIP/a/83m4NC+n7CklZOek4qOlIiDiI2DgISEgHyBfX56IM//6O69x57CsqagoJubnpiRdpGbkYqIj4mIiYiDhoR2INP/9fbp3NTWr6yUtZqghZqTl4OOU3J0j3+AamlpeneCIPHs//zo49e+xsO3u6CafI6jp62bkGVsinRuipiTg3GCIODq/5jrsMulys/GjMHRwjO5frOTsLyqi7O7nH+wS5hfINrS5//kw9TP4tvR3s7EtrKxs7KlrqWWk2+SmKCenJJwIP/y/sfx0dGyyNWyp7+mxKesr4mNeZqrn5aKjZ+cgo5vIP/j1t22wtjUvoTEvbuquYC3fruktM3Hp7uroJyef6KVIP/8x+HLycGrmrumiJqegY2UiIR7eXuKd3dfc3l/dlJtIPn27fr/7+fn+NLH2vHOt8Hd277Czcy0rJnAtZO1vYi0IMf/8Nq8hYGCdnFxdGVuaW1mYF9iW2BYVVtXV1hWVVhOIP/q+dTp3uWV59nb17zJ0tq1xMW81rm74MiylayVx7i7IPjv+PD/wN+96NXF2cDJwbeor7bHs6Gzz7zCsIutv6apIKCfs/+xmpuKjZCn56CSlIuHjp7NkV1Yg3x3hsJgP0RmIPj/6bXOvaa5tKSTi5mcmIuBjZKMfX2FiIR5eH+CfHZ0IPv//ezWvJiPiYiSmJKFiIx/dnaCioF4eWlyenJ3a29yIP3//+/Zv5ioqJWZmJOFf4SEgYB9e3uAe3pzYXiJbYl7IOrk/+bOspWWk4+MioeFg4B/fXt5eHh2dXRzcXJvb21tIP/s3tCbnZqjoqOknrfPy5y9iMKQysuqjJSgjo+AhJu2IP/89dy6pYHV36/d06eVmqSUw7+Ys7aOqn9xiK2kfZegIP/LuNfb1tfTzMCxr6yklHiOjIFsgX13cGZ4dG1ndHBsIPL/+Pzj4trSyLu0uLmuqZajoaOYkIeUkZB7b3WDgXVXIPv/zt7Y4uPm3tvNyLCMmquoq5KHbYmUkY6TgGiBi5SPIOz/7M7t9Pbq3dfX08OxvLd/tL29tJ2anpeqrq+mg5KiIP/n3ubZ5ujD5dC9ycW4v7DDsHyXnbrCn6KboGa2vpKnIP384+//4t/Z4r/h4tHW2tHOz8rEyL2rsa2dn6Ghl5+cIOT+4t//1+bl5dze39fZzcXGv7Guq6Cuo6mqm5KWko2NIP/477jVsMnHtK+IjZmefH54fXR9Y2ZyeGBLaWNgbmdJIP/f2ta9h8mbqaZ+hKOAhF9xeoV0c3VwcHFtbG5qaWZpIP/I07mjkK1SoFOSgoB7f3h2bnRsbm9nb2VpaWhkZl9jIP/69+Lo9/LW3ubZ0dHQva3BvbOnpaGro56OfJeklEZ7IP+94/Xo5/Hn2bXU0MjTzqWwtpaumau2mo+mnYeYm4d/IP/k693Nu8jFv7KwtrSsqamtqqWipaWinZienJuXlpmcIP/f3de8oLa8sKWhqKShm5ibnZeSlZeTjo2Qjo2KiYqLIMf/4LeWi4F7g2tkamlcW0JZU0lERjVUNUU+MkQ/PTI2IP3/zeLAw5upuaugjIuWmIyGgo+DgVt9cHVdTFdja1gzIP/lx7OrqqGjm5eUko2PiouKh4aGg4SAfH57fHp5eXt3IP/c8tvk0ta3y7C/tbC2tbelqbKJopqmmp+kpZGbmqN9IP/i28zEyb/GxsO8wLy5t7S+ubKqtrOwrKmyraafraupIP/w6dvMwcO8s6Wbp6WbiX2Uk4t3dICDf3BVb3Z0Y0dfIP/W2ujk19DKv62GmpiNgX+EgXx8e3d6eHV4dHJycHFyIP/E3fav6NLco73i0czBmcTIzsG0vL/MwbS+rbm9oKasIP/u2sK3paGkqKCbk5iWlI6MjI2KhoSGh4WCgIGAgXx7IP/J/Pjr5tvg1s/CobS3u7jAu7u0l5CNnJ6VqaudopKCIP/p19bMzM7MysfGyMbFxcPFxcTEx8bHxcPHx8XCxsXEIP/+/vXq4ODYz8K0t66knZuGk5yhn5yZmZqdlo2Hk5CJIO+2/9nSwrSovbjFm7yquqOopaukpqWfo6GioaKbmZ6fIPDq//TT4evy3ejx7Obo2s/AsbLB08vNzMLIw8O+vMC1IP/b9OCy09XZ2NXR0cvEu7SytbG1uLu3t7G2sKykpJqTIPnk///k3+nm2szf4+Pp49zi3dbQxsXAtLy8vLu4vry+IN/i/+f3wNzT09Hc3tzYz8XBvK6ylaOOoYiVb5B+kHaAIOT/7LS+m7mrfp54j51UgH+NinGEbH+HbXRef3ZbbV9xINz/+vWs7PTv5NjMwKyalY1zaXB0bW1oa2lqZGVgZWNkIP/J6sLlvuu+45nol9iiyKrHqMSNvKu/pLOAq5SrmJOCIP/jyJSUl5CLi4eEhIJ/f3t5d3V0cnBxb29ubGxrZ2poIP3/68eLhIR8fHlzc3BraWlnZ2RiYGBfYFthV1RZU1dWIP+04rDfp8WgvYqgkKV9jIaYd3t+jnVpd4hwUHKCbDZtIPS6/6zvsdOf0nbHlK9ssWqcd6FcjV2WL38uh1d6TnlQIP/R4Lfapr9iqJyphLSUhmiIi6WGimuSdpF/TGZ7YZhRIP7/7t7MvKu4tbWSg6esiJ+fjZWdhW+djouBj3mRmWp4IP/BubGrpqSgnJWQi4iEg4SJiYaEhH99e3h2dXR1enl5IP/Ex6KbmZWRj4uJhYSBgX58e3l4dnV0c3Fxb29tbWxsIP/G5JrNn8iOtoeigKSEh1+ShplqiYKed5V5nHuXZpV2IP/P7ua2xNHKqcC6s6i6rIKqs5uXq6p9naKebJ6ZjYmcIP/VyK2umqqZkI99i4+Ge4KFf3l8fXl3eHR0dHJwb29vIP/44trWvrKuq66lpKeno5yUl5qZlZOQkJGNjo6Ni4mFINDU9v/v0e3e9+Le197Z0NmtuMrHxsK8zMbEo6OkqqCiIP/3+9zusOiy66/OX7+YvoHFhLmLfHy3kbR8qHKEa6Z0IP/3/fDcw9LTz8fBwcC9vLi2tLS0sa6ura2rqKmpqKakIPz1/+/s9ufd59u72NDRytW/t8Oprsm/p7aslra1r6qzIP/Cr6afm5ea0KPgpJaOiYWAerZ+tIyFgX99fHyOZ3V4IP/CuLGsp6GgnZaQi4iFh4OJiIeEg35/fXZ2dXR2eXh5IP/N9e3n4trWzsi+vLepqKSlp5qPkoOHhnmFe3hybGpfIP/0nvLv2dG7wZepsqiglHyUkZGHfZiZiHCQjoJzeomJIP/PurPOs9mpm5ydmbOJhomIh4WDg4OBeHZ8fHh6eHl1IP/J1rfOsMew0bGIhKmgnn6yrpZ/cYyNiJuRaox8amN3IP/W/NH0w9TEwr+etZenopibhZ58kIhul1h1eHOGcHJ3IP/k4OHWwrzGxry0tre1s7Crp6mnpZ6kqqKbkpmcm5ibIP/b2v+Vnqatm4qSnJONioiLiYWBg4WBfn5/fHx6eHl5IP/0yK7XxqO2tqCasbuzr6i2qKmgk6GjpKKHrJSYlJ9yIPC7/Mfwuva0/8jsl/mk87rsou2e0JbfiLF7zIadf6+EIPbQ4rX/zcrQ9sW1ruLcjqPU4K+gssizt7XJnKGnsZSgIP/r5s/alaqIpHbGl71xxo+9arB0tFZ7QYRgnXCWbqp1IP/U1o7Lobegv3u6pLKDrJWda6NCqJGhf52UkHCMf5eAIP/v/vThxX6jop2al5SSkI+Ni4mIhoWFg4KBgH99fXx7IP/Ku9CuvJ21goCYq6qrop6Pj4SFnKGhopualYuIlZidIP/h+ODt5OymzM3NstvFyczIx8TEzaW6y7ebtcyrkMWKIOno8P/99er388fV0MLfzbLTv7PFpqbFpsaotauomX+UIP7h6+7x2v/958K63czS4tW0q8/Sos7QtZW+0ceYw7SVINnz//LN5Mza49DJxKnKusewv5mm1LqTsKi/tbqsp3+CIP++rKKclJ6Rr4mVhYd9d3t1eHd2dXSWb4pua2tqamhpIPLy2f/y2uPh29nCvs/Pz9PV1s/Uy8vBtJajkaWOiJGWIP/s2M/Fy7urr6akr6Wan4OWiYqPm3N/YGR5h3B1dk93IPDr/+fk7+3m4tDGycbIvsrLxLOylodTeIONi36Nn4mVIMbG4LDR2P/e0crEwLy6t8Gxr62rp6upp6aloaKhoJ+mIKjhuZ2Rm536dZmn/7ymm7W69riqq8yxjJSVq/2Mipb6IOL/r/P5u9rtqOGen+K9seuci83kremZiLe1nOCalq/gINBtyJP/iqxr4XqBdM1mrWaWWXxkpUqXWY9RXlK3K3tIIP+7zaq/qKWWmJWVlZOTjo6Mh4eEg4CDfIB9fn15enp1IP++qqObkpGJjoSEgICBfnl3dnJueHFucGpgZGplbU5ZIP/v0cfEyL+1s66ysa6kp6WlqKSinJuan5qamZSbl5SUIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIMqxxITRu+DOx6HT89bc1tvA0u3/0uCa7+TT3fHb1Ov6IP/N2KLY29S+wMmEzsfWw9C0tbjS0LLElsDSytWYwsTSIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIIeFh4mJiYyOlJSXm6Svwf/AraGWkIuJg3x4d3FwaGtpIK/n/729stvXtY+un6G+msauorbYsaKSoLa1kpWkkryeIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIP7o4vvT5Ob36vLXzOrW7ujLyePZ4uXK0+nD/7754/XoIP+O7/HZ7sft4aXY0dvk2u3f69/d0u7P79DW5Lft5Ne8IPH/7da8TbzR0K2tWK+xnZGeVZuUf4NqM2Z8gXB+RHN4IP/sw9rg2bTGwbuwV5qQlKhvk5aEgpRLRVJyeIFwWBxuIPn+/8/0+f7A3uDTycqnr6GSpbestLWmg3iEqXmmoZR8IPj/58ayuKqJloabc4lxDnBtaW5mcEFgXUtcJl1VSlpLIP/62rWIN0Q2PyQeJAgkCgEXMZI6k0U9ODQpKygQHiYWIP/v1LyXL2hqcHvQXc13aVlWT0dMTUybU6pLRTMoLSsmIP3/v43a9O6n5tbMlNjy0KLM2a+cvdjCpMvXuYHD1LGjIP/stcm94ujPu8rT0s7RuMzLyaTEy8GTtsW2iK+9r3SnIP+pmI2HhKtxcG5ramhrZWFgXl1bP1lZV1ZUU1ZTUlFQIP+oloqCi5OAeWtnWivIedOCd3FsZGxecWhmY2JmXXZgIP+nlYh/sYR7dXJvb22cYWBfXlxYfF1bWFdWVUpTVFJRIP+ld+udjoiEfHl3c3F00HxzbWppZ2VkYmJfYF5dXFtaIP+eg+ORhn97eHW4YGVjU2KIVLliX1tdUlBYVVZSVlFJIP+gjH10eGt5amZhYVxaWFhUVmpPZUxOTExHSkJDQ0BFIMrFvru7/7n0raeniZZ9joeCgH11eJJ3d3J0cHFucm5tIOTp//X03O7S0r6+zLOehYqjqLTBm52nscqkxnmjtqPEIP/Zs/ag4ZzVlHuMsYiEe6eBhXqGc3JvhnhxcnRwc26JIM3/mmJpWU5MSEZCQDo3OzY4NC8zNDM3MCwsKSwnKyUjIP/65ey4zLOYoFWUeo2Ch4WChYCEfYJ2fHl5b3RwZ3B0IMX/2+quxp+0hZOLo42Fh4KCkYGNfnp3gHZ2enB0cHCCINP/4+3W0rSsnaOgpUdmcZl6e2h9dHtralxfYnI1Ki5qIOf6//PWwcu9eIGqnoidqZ6HcoZqfpSEc2BkZ2x+hVpTIOvv/6/tjteFyNDRjbbSyXacab1njL24dH25tFyJWKdXIOHE4v++zNPP2sa/v6+tspx3imqAjJKKlYpqi4lJcnuDIPr//bPs1dOh17LDlK23paediYubjo6MfId9d2+Oe32FIP/qstTR0sKzgrmqs86+scOzbKuLfraygqepfIJsf2mVIP/9mta9xL6Ea4iWVJaKWl17eXhJSWxvPmhYQg5mYU0/IP/+9cP47NHE8dG2y9TRwcO00MGsqcqvgLC4oLC3n6apIPf/5L2cSTkwOiscGy0AMDETIh0uHTETKRctADQuEy8AIOzK//3N6dfRzNazycTJxqq5lZqosbqjpbqmv76hu6WWIPX8+/+89N6/0eC1wq6uzbWVwL6ztay9uKqeoreXk6usII2grf+oqJubi4WX5neAbYRzjYrWlZBvhWyGisZ2jlh6IP/+4rLGto6amXOOaoRxdHNia2tcbSVnW1VfLVVNRVorIPX/9de7kXZgioJrfGhscnNwW2pqSmpoWlxpV1NmT1JPIOT/5rWbg4N8WnaHgWhqbmVcY2ZiY2FfUlxaa2VzVG5aIO70/9iwiEdXV1VJTUxNSUVDOjo+QUE6Njw6Oiw2Nzk/IP/x2Nu6iY6Zlp2PfaTCv1WuPbBmv8ClYYSZh4locIWiIPv/78mesITD2H/TzVimS4VCsq5Ur69NnUSUOZWRZI2TIP/i2OXc18q6sqWWk4CFdndtbmZlX1ZTQ0oBPw4xKyIhIO3//vrf29C4v62rpJyRmmyOenZ/TndvW3VncmppaFlkIP/7vOLk6ODb0MCsZbWstKqTgYeWnIJ2c4WHX3duboNvIP/g/ffq356pvsKdraOolbCdl3iqj5+NnHGZhZBtmIWLIP/45urx6PHhzsfAvryfy8KzzLCzrra5vsXAqo24xLGzIO/77/T/3Ojl1dPm3d7HysvMwpS3trGnlrWjoouohHl8INv/7/D+w+7j49PX0tTDvrm8t6ajsKach6uRloGlkItyIP/66ZrQurSlm5eHjnqEanlLcTxsJWc2YDpXOlM0T0JSIP/YzNPAcLxqk5yBU2pRa21EUmBPTlZDRUlDRERAPz47IP+cwpupiKF1koB7cVdiZ2JkXmBXX15WV1NTTVRTTFJPIP/t8+Pb9em01tPFssW7oZusq5p6pKmXhJqQiW6TlYNkIP/v0PX27dbQ0pPNvaC+upGjgqWwoo6ZkIudlmOQdn+PIP/qusyysqyIpo6ckZGRiY+HioOFhIGEf397fnx6fHl4IP/nvcaorpuNkH2Ae213SXRZbF1jX1ZfSFNJUFJKU0tOINH/zo6MhH15cnVxbmtsZ2dmZGFfZF5eXFxXV1tYVVRVIP/548nFtqqiqIima5OGhoh1hYJ5f2d4c3F6aHRnZnBoIP/YlYp9dXNubmxqZGRgYmBgXVZXVltVWU5NUVBTTE9IIPn/7/fp7eTY39bb2NnZ1dfN0snLyMTJwsnGx8jDxrrBIP/y7+7o9ufc4Nnc2NrV2dTM08vQyc7HvsW7xLrCua+4IP/04tjKw7mrq5+elJKKh4Jxc21nZGFQU0pKSidFNTowIP/59PDi1cOmoHKAXm1jZVxXYlVeW1RYV09TUUlNSEBNIP/d4fzC8tHQv7Hj0tTBrK7G1beyyr3IwaK+vb7HkqisIP/vuLSjipiJi4d0gXZ3eXJ0bnBwaW1pampmaGZlZmVhIP/u8Ore0cKxwcbLyMC5q490oqqqp5iSg2yGjY95cmtvIPH6+P/4/PPu7unp5OLe3NvZ3Nzf3+Hh3OLc4dzg28/aIP/86+LOwqqdnKGfnpyVlId6emNoWFJRUEVOOz4xGiQmIP/w497Y1sjFwMS5yri4tbampZ+jhZ+Nj5N6jI93g3iBIP/05d7B4uPOxsatv8S8xsG0ua2goZKUlIiIi3VsgYOCIP/XzNnU2dbNysC2trO6uLqztKummo+Da3tkclBwd3qEIP/uztzc3tnG1tbNy8u9urejsq2vtrO0srKusKekopKTIObm9v/47vTj4srJxpm0sqSLqnaYbZlpeFF3VHpxemR1IOb/8se0t8WlmqyXnaOPk4dxloRwgpBpe4Z6d3l6fXdtINz8/9/r9O/f1cG0mpJsdFxdXltXV1dQTU9MU1dUVk9YIP+wvJ3ml9+S15HZl8SevJGug52AgGh1doJkgWdvZFxLIP/Qk3NPK0RDMSIWKCgqGRwfCwAZAAgAAgMJHAsACRYFIP/2zaZwYGRZTVpMUUFPQ1FFQTo9QDw7PjkwPDA0Ojo9IP+s3Ivba7IltViZSJpLh0qBS3NAdD5qPWs7Yj1jN10xIP+i+K7toNVhx3u+g55ypVuZapVof2OFWn9ChFh1ZVhmIP+izJnYbsB6bX6ocbR1dmiDbpxKb3l/QpJPUX1pZ4NIIPn/3NjHx76uvJuzkKmGpIqZgaB6j3Ghe5GQjXCHlXSAIP+hgH53Y2BATjpVUCo5KEM9QUIfADUxQDQzHh8tMjUZIP+auX9qa2ReWlZTUU5LSkVHQT4+Nzs7OTg2NzY6NDswIP+X2pTChKtopWmoeal8p3ihcZxplWuPa5BrlWOXUYxEIP/Z392ppcSzjrW6qZitrpWYn4qFnZmTnJ+MkpaWdomOIP++h3yXbodaZllkTldMR0RHPkg7RDZDOT4zPDUtNCkxIP/21sKUsahxpJiAkoCJg2WEcGx0c3tjcnlsdGxubGRsIKjN0P/t7+Xn4tzNq7vHyNO0vLOXkZ2hg56Xj4R3hIqjIP/49NHhl96c4IrJLbRoxHW0dKlOeGKpXqlVl0hvQIxXIP/svs22sq6mnKKVmZSSk46PioqKh4iFhISBg3+Af359IPT1/8vj6dDHz8ujw8Gmtqmfp6OhqJ2Xo6OHn6SZmKSAIP+YdlxhbHiGyHTikYB0bGJaRaNGq3FmYl9ZWFaAQ3NYIP+lmI+MamFNeG5rYD1LX2ZgTzdIUltVVz8yRk1IS0wbIP/z9vLl39TFxLO2samdnI+Jj4B7eXFwcW5eXFphY04xIP/+2t/bxqWftKp0nKCEmoJ2iFtwdnA6a29PblhaY0FLIP+rlJTNgsl8VFqBOptZVAxfOlZBOlBGSE4tOi1CNzs1IP/O1KfRwsqDzLWTfpuRm3WkqnWWd3KBWY2NXn1EeW9ZIPTb/9/w4965o7q3t3aCpqerfHqilKWFhJ2MnHSEmYqNIP/vssnAiK2kkZCWj46Ajo15jo2Bi5WVjIWVjUyJh0uEIP/sqPWkmH6CXXQ9aElTUCtJMz9LMFArSCtHLkEyMS8hIP/o34XCtciujprGtZqfvqWRe6WXppiTl6+Vj5aohXl4IP+f0aj2qviQ2nvpT7JqyGmPYLRQdjuUM0UNaBkvI0Q0IOze36n/2sqq78izucDYpabFzqqXlrufabChqZiRnY6lIP/y4srdqZl/o3fOX8SEz2e3eLBcr2iNTpYbkDGbX5xLIP/IwqfAZsidsYmqdbyWr5yGgpRhpYaIh4iGnoeDiG5sIP/9+ObHpYprZGFfXFtWUVJUSFBQSUhOSEpISkhCPEREIPH62v/a8dff1NbRyNPJ0s7JzMnOws/Fu8W8xLvGure+IP/o7PPs7fHR69a50tfBvNrSyc/SuKDFkbiZx7mXbbPFIO//9e7z6Nfm57LOx7POvp63q6+1k6Ssf7KXWJmXa495IN3x9r3/9MvU2tPctMnancymsdO8soiSxsaKlq+1xKGYINP0//HW6NLQ4dLUybPIvMWuw6Kx1aerrqq/qLyzsY6VIP+mloqDfaB5lXGFaoRlY2NnX1tbWFR8WXlWVVZSUlFQIM/JzP/n2cnYsKnMzNbaz9fKx7i9jqqen5+TmYqhlZSqIP/u08++08WYs6qYqbKboZeFjZ2dkIB4c4+YmIB+fXOWIO7y/+jk9Ovi4s/BxsbLwMzGxLOwioZlYpZ7enmIm42UINDV06u16//Wxr6vrKiloK2gm5yXk5WSkZCQh4uKiYiTIIHikKR4soL9lplv+pLMibWa1Xk/i9iK5HOajP+UnJbyIMv/rOPaYtzgm9BgcLrSldloan68bMtgRW7HZ7BnV0qbIM1e20r/WctL3GeLJM1bmFF3UIVTviyPSZRIWUajPIA0IP/j19DJxMC8uLWzsK6sq6mmpqSioqCfnp2cm5mYmZiXIP+hj4N/eXVwZ2llYGxhXVxQTFtZXVJTSllAP0VYQ01NIP/k1MLAvrq4trOwramopKWjoZ+enJybm5iXl5WTlZWSIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIM3NtM+wndjjj8G8+NK60uDAx+DgrtDF/8rU0unHj+HrIP+muH2ShI2VmXuOe4WPdX+RmnF0iohuh6mBcpCYeZGQIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGdnZ2hoa2xvd3R5fYegn/+gjIB4cGtvYF5bWFNTVU1EIJ/g/8+2uqTGzoyorKDenb6uhJ++l26QlZKWhnGTnreeIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIO7z4OTl7+f29vDo58/V2ujT1fDLycbj8fvU/97I1uTiIPr/6uS59e7R2+XB5bvJ5uPs9ODl0tvjtu6m0dXI3djOIP/56r+veLvBrJOMZ5GWeG19XnZtX2tyV2hUYWJYT0NcIP/e07W1ub2sj5t5X4CDVX9PbUxPUW46TUk8SWBIUzZOIPf7/8vC06hbuaa1iaGipnCZl495gINtdFd/S2c8c3RXIP/30Lq7coxtkmuCS3EvcWJxVlRXaVRQPl1bTjZUSlpNIP/typpkcG1lZGFfYFpWVVRUUHdOdVBKSkhJSEVHSkZMIP/r06+OeW9qa2fAcsJOVF9TUVRVT1OIQ49QTDdMVkhOIP/p1KDv5dyl3unIltDgxZTM3sCSrsS9nbS1k4enqKeGIP/o8cvX2t7i1tm/ydDCqLjEsJGerp6QlJ+Kd3qEdXN2IP+ZiH95cZttaGZjYV9fWlZYVFVTWVFQUU5OTUNMSkpJIP+ZiYF+iHx/h25oYlqhWLNkX1tZV1RNV1JRUU9STC5NIP+YiH95n49saGZiYF+NV1VWVFJRZFNPT01OS0tJSklJIP+MfNuJgHl0cG5ramptzU9WVVZVVVJUUlFRT09OTU1NIP+Vh9qAeXVuam2dal9ddVdlW5lXVVRQU1BOR0xNUEtOIP+VhXpza2JnY19cW1ZVVFJOT05LTExJR0dIRUVDQz9EIP++x8G68VjWbm2CiLla0GNTYmNTT3YsPzgsOzo8NEg/IP/z8vH3x9C7s9PS3lfEv9HfusyWp760vql2pK61nqutIP/Xfe+RxpPVjpN9l4aEe6pyc3R4cnJvdW5la2NnbWV9ILH/fW9kX1xaVVVQTk5KSUdEREJDQj8/Pjw7OTw7OTk2IP/v27+ZhHJ9eoB0dW1qZ2RlYGBiXmBfXFZcXFhhXFVYIOr/4uWTxYS3nHR4nnJte5lnVmyIZGVkb2deY0FkWWFwIOb/zeXCu6evnKCVjn2CeYtTYUp7QUVBcFRYS1FMTE9OIO7/+cnO28ywjkuWpJqOVlhyh4SEW2NjcoF/QF1ZanRuIPLw/5bngc99x83Hf7TJum+oaa1fmrCpLpizl1mPQ5VVIP/39fXR0crPycrOy6err5GqpIWgoJaWj3xxfIFkfomKIP/99q/s0ta1sqimlJ2HgZeeh5Z8lIaFf4N+WHRNUXRpIP/ivr7Pz97Urqmxn7mppraWkJd5ka2ng56mXH2DX1mCIP/0lsW4u695dpuMbHuKaVR0elBhYWllWlM+XlNbVkxZIPn4/6L45cLOwcaN0MS8ybCysqqPtbFnurGNrayEq6tVIP/qvKSEd3NvZmlmZF9eXVxdWFVYWVlQVFBQUk9LUE5IIN7s/9DbuMa4zK2/hZWnqrm2mpObnY9TqpCEkJiVkmlsIOvw/93Ty7y8wquws5ZRr6pgiJajr4+dkpidj5aNpqmpIGKdnf+gjouMgo+T26OQgomIi5PKmo6DiYmFjrqhjHCEIP/y3Zi4lJuClWx4bIBmbUdoXWVLSFZmVVNEV09WRDNKIPH/7MekiHt2Zm1jZlw+XkJZT0xWZBpNUUFBU006VEcnINT/zJN1XWNwYFVqaEBMNjggPSxEOTYzB0k2KzxRIGFaIPP//86jinpxbGdoZV1iYF1eW1tZUllUUk5QTE1PUUdFIP/xyta2dZ6liZaIgpCwr1ugRJpjrLGSboCReXNkf3CJIPv/68KkhmfBy3TEwmmnYKBAqJU+oZ1NiVeISoiAaYh6IPb/+uTXyLellIeFko2Jg4B6dnZzcWZoa2VlX11eWmNZINvv/+HOvbWZnYmOaXBrcV5ePExPUjItSElGNj08PkIwIP/J7eLm3NnKwZGLlZiahmx5im9yWVZueW9STmBiV1NgIO3/6sOvwrOrtJ+gmYGQlYWRjHODcWN6bW52U1xeTVxUIP/x5ujl5dvT3ebLtM3LyarDyrq5sbi0rJW7ubG4p5uRIPf///H04uHk47bFxcyxp6+/spGMoaaHeY+iZ2KBjnJZ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'

const envelope = [[0, 1.16, 0.157, 0.252], [0, 1.58, 0.109, 0.276], [0, 1.56, 0.117, 0.136], [0.0232, 1.49, 0.111, 0.276], [0, 0.766, 0.0805, 0.0666], [0, 1.35, 0.0868, 0.0434], [0, 1.65, 0.134, 0.136], [0, 1.6, 0.129, 0.0434], [0, 1.09, 0.0605, 0.252], [0, 0.813, 0.0542, 0.159], [0, 0.766, 0.0224, 0.5], [0, 1.7, 0.217, 0.252], [0, 0.441, 0.0544, 0.0201], [0, 0.58, 0.0511, 0.0201], [0, 0.882, 0.0786, 0.5], [0, 1.56, 0.0909, 0.415], [0, 0.975, 0.721, 0.0666], [0, 0.0697, 0.94, 0.0898], [0, 0.139, 0.602, 0.0434], [0.0232, 0.0929, 0.802, 0.299], [0.0464, 0.627, 0.747, 0.136], [0.0464, 0.65, 0.492, 0.0898], [0.0464, 0.488, 0.715, 0.0201], [0.0232, 0.0929, 0.92, 0.159], [0, 1.6, 0.123, 0.0898], [0, 1.18, 0.052, 0.0434], [0, 1.07, 0.00299, 0.0201], [0, 1.07, 0.054, 0.0201], [0, 0.65, 0.051, 0.0201], [0, 0.163, 0.789, 0.136], [0, 0.139, 0.758, 0.136], [0, 2, 0.233, 0.0201], [0, 1.7, 0.15, 0.252], [0, 1.42, 0.0763, 0.0201], [0, 1.6, 0.124, 0.0434], [0, 1.56, 0.132, 0.0898], [0, 1.32, 0.0756, 0.136], [0, 0.766, 0.128, 0.0201], [0.0232, 0.418, 0.0556, 0.0201], [0.0464, 1.72, 0.0445, 0.0434], [0.0464, 2, 0.315, 0.276], [0.0464, 0.255, 0.77, 0.159], [0.116, 0.488, 0.859, 0.113], [0.0464, 0.163, 0.855, 0.252], [0.0929, 0.673, 0.651, 0.5], [0, 0.372, 0.0391, 0.0201], [0, 0.789, 0.0757, 0.5], [0, 1.58, 0.12, 0.5], [0.0464, 0.627, 0.682, 0.5], [0.163, 0.488, 0.944, 0.5], [0.0697, 0.0929, 0.962, 0.5], [0.0929, 0.743, 0.979, 0.5], [0.186, 2, 0.892, 0.276], [0.0464, 0.0929, 0.868, 0.113], [0.0697, 0.279, 0.255, 0.368], [0.0232, 0.395, 0.035, 0.0201], [0.139, 0.186, 0.962, 0.136], [0.0464, 0.72, 0.444, 0.0434], [0, 1.14, 0.334, 0.136], [0, 0.0929, 0.687, 0.0666], [0.0232, 0.627, 0.828, 0.485], [0.0232, 2, 0.861, 0.136], [0.0929, 0.186, 0.838, 0.136], [0.0464, 0.186, 0.556, 0.113], [0.0232, 0.0464, 0.965, 0.0898], [0.0232, 0.186, 0.661, 0.0898], [0.0232, 2, 0.871, 0.0201], [0, 2, 0.67, 0.0201], [0.0232, 0.0464, 0.992, 0.136], [0.0232, 0.0929, 1, 0.0434], [0, 2, 0.658, 0.0201], [0.0464, 0.116, 0.759, 0.0434], [0.0232, 0.116, 0.576, 0.0201], [0.0464, 0.139, 0.726, 0.0201], [0.0232, 0.255, 0.519, 0.136], [0, 0.0464, 0.712, 0.0898], [0.0929, 0.163, 0.378, 0.113], [0.0232, 0.325, 0.174, 0.0201], [0.116, 0.163, 0.987, 0.159], [0.0232, 0.302, 0.516, 0.0201], [0.0232, 2, 0.814, 0.0201], [0, 0.139, 0.683, 0.0201], [0.0464, 2, 0.284, 0.159], [0, 0.139, 0.769, 0.0201], [0, 0.627, 0.503, 0.0201], [0, 1.16, 0.646, 0.229], [0.0232, 1.72, 0.445, 0.5], [0, 0.0464, 0.905, 0.0434], [0, 0.627, 0.632, 0.5], [0.441, 2, 0.217, 0.461], [0.0464, 0.975, 0.704, 0.252], [0, 0.511, 0.66, 0.5], [0.0929, 2.02, 0.0269, 0.5], [0.186, 1.6, 0.103, 0.5], [0.116, 0.998, 0.626, 0.5], [0.418, 0.65, 0.681, 0.5], [0.0232, 1.6, 0.199, 0.136], [0.418, 0.441, 0.703, 0.5], [0.0232, 0.998, 0.0314, 0.461], [0.0929, 1.72, 0.123, 0.5], [0, 1.44, 0.241, 0.5], [0.534, 2, 0.584, 0.5], [0.0232, 2, 0.885, 0.5], [0.0929, 1.51, 0.327, 0.5], [0.0232, 1.86, 0.238, 0.5], [0, 1.14, 0.0565, 0.252], [0, 0.604, 0.0565, 0.5], [0, 0.464, 0.062, 0.5], [0, 0.488, 0.0529, 0.0201], [0, 0.0232, 0.998, 0.0434], [0.0464, 0.882, 0.532, 0.252], [0, 0.279, 0.678, 0.0898], [0, 1.42, 0.0644, 0.5], [0, 0.116, 0.00112, 0.0201], [0, 0.488, 0.051, 0.0201], [3, 2, 0, 0.0201], [0, 0.975, 0.0521, 0.368], [0, 0.279, 0.0387, 0.0201], [0, 0.836, 0.0509, 0.0201], [0.627, 1.88, 4.54e-08, 0.0201], [0.0697, 0.163, 0.0072, 0.0201], [0.116, 0.255, 0.328, 0.299], [1.44, 2, 0.976, 0.5], [0.0232, 0.139, 0.0105, 0.5], [0, 0.209, 0.917, 0.5], [0.906, 2, 0.654, 0.5], [0.279, 2, 0.999, 0.5], [0, 0.302, 0.0269, 0.0201]];

const quickfadeArray = [
    // Piano
    true,   // 0: Acoustic Grand Piano
    true,   // 1: Bright Acoustic Piano
    true,   // 2: Electric Grand Piano
    true,   // 3: Honky-tonk Piano
    true,   // 4: Electric Piano 1
    true,   // 5: Electric Piano 2
    true,   // 6: Harpsichord
    true,   // 7: Clavinet
    // Chromatic Percussion
    true,   // 8: Celesta
    true,   // 9: Glockenspiel
    true,   // 10: Music Box
    true,   // 11: Vibraphone
    true,   // 12: Marimba
    true,   // 13: Xylophone
    true,   // 14: Tubular Bells
    true,   // 15: Dulcimer
    // Organ
    false,   // 16: Drawbar Organ
    false,   // 17: Percussive Organ
    false,   // 18: Rock Organ
    false,   // 19: Church Organ
    false,   // 20: Reed Organ
    false,   // 21: Accordion
    false,   // 22: Harmonica
    false,   // 23: Tango Accordion
    // Guitar
    true,   // 24: Acoustic Guitar (nylon)
    true,   // 25: Acoustic Guitar (steel)
    true,   // 26: Electric Guitar (jazz)
    true,   // 27: Electric Guitar (clean)
    true,   // 28: Electric Guitar (muted)
    false,   // 29: Overdriven Guitar
    false,   // 30: Distortion Guitar
    false,   // 31: Guitar harmonics
    // Bass
    true,   // 32: Acoustic Bass
    true,   // 33: Electric Bass (finger)
    true,   // 34: Electric Bass (pick)
    true,   // 35: Fretless Bass
    true,   // 36: Slap Bass 1
    true,   // 37: Slap Bass 2
    true,   // 38: Synth Bass 1
    false,   // 39: Synth Bass 2
    // Strings
    false,  // 40: Violin
    false,  // 41: Viola
    false,  // 42: Cello
    false,  // 43: Contrabass
    false,  // 44: Tremolo Strings
    true,  // 45: Pizzicato Strings
    true,  // 46: Orchestral Harp
    true,  // 47: Timpani
    // Ensemble
    false,  // 48: String Ensemble 1
    false,  // 49: String Ensemble 2
    false,  // 50: SynthStrings 1
    false,  // 51: SynthStrings 2
    false,  // 52: Choir Aahs
    false,  // 53: Voice Oohs
    false,  // 54: Synth Choir
    true,  // 55: Orchestra Hit
    // Brass
    false,  // 56: Trumpet
    false,  // 57: Trombone
    false,  // 58: Tuba
    false,  // 59: Muted Trumpet
    false,  // 60: French Horn
    false,  // 61: Brass Section
    false,  // 62: SynthBrass 1
    false,  // 63: SynthBrass 2
    // Reed
    false,  // 64: Soprano Sax
    false,  // 65: Alto Sax
    false,  // 66: Tenor Sax
    false,  // 67: Baritone Sax
    false,  // 68: Oboe
    false,  // 69: English Horn
    false,  // 70: Bassoon
    false,  // 71: Clarinet
    // Pipe
    false,  // 72: Piccolo
    false,  // 73: Flute
    false,  // 74: Recorder
    false,  // 75: Pan Flute
    false,  // 76: Blown Bottle
    false,  // 77: Shakuhachi
    false,  // 78: Whistle
    false,  // 79: Ocarina
    // Synth Lead
    false,   // 80: Lead 1 (square)
    false,   // 81: Lead 2 (sawtooth)
    false,   // 82: Lead 3 (calliope)
    false,   // 83: Lead 4 (chiff)
    false,   // 84: Lead 5 (charang)
    false,   // 85: Lead 6 (voice)
    false,   // 86: Lead 7 (fifths)
    false,   // 87: Lead 8 (bass + lead)
    // Synth Pad
    false,  // 88: Pad 1 (new age)
    false,  // 89: Pad 2 (warm)
    false,  // 90: Pad 3 (polysynth)
    false,  // 91: Pad 4 (choir)
    false,  // 92: Pad 5 (bowed)
    false,  // 93: Pad 6 (metallic)
    false,  // 94: Pad 7 (halo)
    false,  // 95: Pad 8 (sweep)
    // Synth Effects
    true,   // 96: FX 1 (rain)
    false,   // 97: FX 2 (soundtrack)
    true,   // 98: FX 3 (crystal)
    true,   // 99: FX 4 (atmosphere)
    true,   // 100: FX 5 (brightness)
    false,   // 101: FX 6 (goblins)
    false,   // 102: FX 7 (echoes)
    false,   // 103: FX 8 (sci-fi)
    // Ethnic
    true,  // 104: Sitar
    true,  // 105: Banjo
    true,  // 106: Shamisen
    true,  // 107: Koto
    true,  // 108: Kalimba
    false,  // 109: Bagpipe
    false,  // 110: Fiddle
    false,  // 111:Shanai
    // Percussive
    true,   // 112: Tinkle Bell
    true,   // 113: Agogo
    true,   // 114: Steel Drums
    true,   // 115: Woodblock
    true,   // 116: Taiko Drum
    true,   // 117: Melodic Tom
    true,   // 118: Synth Drum
    true,   // 119: Reverse Cymbal
    // Sound effects
    true,   // 120: Guitar Fret Noise
    true,   // 121: Breath Noise
    false,   // 122: Seashore
    true,   // 123: Bird Tweet
    true,   // 124: Telephone Ring
    false,   // 125: Helicopter
    false,   // 126: Applause
    true    // 127: Gunshot
];

function base64ToBuffer(base64String) {
    // Decode the base64 data
    var binaryData = atob(base64String);

    // Create a buffer to hold the binary data
    var buffer = new ArrayBuffer(binaryData.length);
    var view = new Uint8Array(buffer);

    // Copy the binary data into the buffer
    for (var i = 0; i < binaryData.length; i++) {
        view[i] = binaryData.charCodeAt(i);
    }

    return buffer;
}

function dequantize(uint8Arr) {
    return new Float32Array(uint8Arr).map(value => {
        if (value == 0) return 0;
        else if (value == 255) return 1;
        const dbValue = value * (80 / 255) - 80;
        return Math.pow(10, dbValue / 20);
    });
}

function parseInstruments(arrayBuffer) {
    var dataView = new DataView(arrayBuffer);
    var instruments = [];
    var offset = 0;

    for (var octave = 0; octave < 5; octave++) {
        var octaveData = [];
        instruments.push(octaveData);

        for (var i = 0; i < 128; i++) {
            var ampLen = dataView.getInt8(offset, true); // Read the length of the instrument array
            offset += 1; // Move the offset to the start of the instrument array

            var instrumentArray = dequantize(new Uint8Array(arrayBuffer.slice(offset, offset + ampLen)));
            offset += ampLen; // Move the offset to next instrument array
            octaveData.push(instrumentArray);
        }
    }

    return instruments;
}

// Initialize a wave cache array with 5 empty arrays
let waveCache = [...Array(5)].map(() => []);

// Variable to store parsed instruments
let amp = null;

// Function to load waves from a buffer
export function loadWaves(buffer) {
    // If no buffer is provided, load default periodic wave table
    if (!buffer) {
        var b = base64ToBuffer(instrumentData);
        amp = parseInstruments(b);
    } else {
        try {
            // Parse instruments from the provided buffer
            amp = parseInstruments(buffer);
        } catch (e) {
            // If an error occurs during parsing, load default waves
            loadWaves();
        }
    }
}

// Load waves initially
loadWaves();

// Generate a random phase value between -π and π
function getRandomPhase() {
    return Math.random() * 2 * Math.PI - Math.PI;
}

// Create a waveform based on the instrument ID and octave (default octave is 2)
function createWave(instId, octave = 2) {
    // Retrieve the instrument data based on the octave and instrument ID
    let inst = amp[octave][instId];
    // DC offset, should always be 0
    let real = [0];
    let imag = [0];
    // Generate the real and imaginary parts of the waveform
    inst.forEach(f => {
        let phase = getRandomPhase();
        real.push(f * Math.cos(phase));
        imag.push(f * Math.sin(phase));
    });
    // Return the waveform as an array of Float32Arrays
    return [new Float32Array(real), new Float32Array(imag)];
}

// Get the waveform for a specific instrument and octave (default octave is 2)
export function getWave(context, instId, octave = 2) {
    // Check if the waveform for the given instrument and octave is already cached
    if (waveCache[octave] && waveCache[octave][instId]) {
        // If cached, return the cached waveform
        return waveCache[octave][instId];
    } else {
        // If not cached, create the waveform
        let samples = createWave(instId, octave);
        // Create custom waveform using the context
        var customWaveform = context.createPeriodicWave(samples[0], samples[1]);
        // Cache the custom waveform for future use
        waveCache[octave][instId] = customWaveform;
        // Return the custom waveform
        return customWaveform;
    }
}

function findClosestNumberIndex(target) {
    // Calculate the index based on the fixed sequence properties
    if (target <= 45) {
        return 0;
    } else if (target >= 93) {
        return 4;
    } else {
        return Math.round((target - 45) / 12);
    }
}

export { envelope, quickfadeArray, findClosestNumberIndex };