const instrumentData = 'IP7/5d/QjNbw7de+kcLb2b6ah6m9wKyrfqqtp5mhe6WeIPf/5vv33u7u1t3ek9vLwr+zt8OktbGTYI6DV65wlpWJIPr/ubrn59C54uzuwOTf7KfbxtWY0cLAkZi+q66Uba6EIP/978G6eLaJh5OQl2B1iIR5UXR2fmJQXWViV1JIWF1dIP/96s6gkZKPioiGg4F+fXx6eqx3oHBvbnBtbmtqaWlnIP/o2b2Gh4uIhorWkdZ5bmxpaWdnZV2ue7pATFVSWVZWIOn72Lv/3frB/abwxPz39KT04eGm5u/Ap8Td0bfR7b82IP/i6tnc4eTZy+Xp5Mzazri1nbN/raOjrayxkrm6uIa9IP+yoJaRiLiGgn58eHd0cnBvbmxrgGdmZWRjYoJfX15dIP+1oIt5uszLu6Sen6ftkNtwXXN/npucmXdscW/Da896IP+yoZaPsZiEgn99fXufbW5tbGtqgGdlZWRjYmxeX15eIP+9svSMZFJcXV9jZGp52nhjW1ZTT1dISkdGREJBQUE/IP+xpeVyeHlzd3nATFZZp1uqKMRwaGFfW1pdW11ZVlZaIP+zopmTiIaIgn9+fXNxcnFubYNnemhnZWVgYGRgXl1eIO+8ubm1/6n9ur6+mc9015iJh5CFhZF8e3p6eHl1dnR1IOr1//rd0NjhvcK0yteqya62uLC/oaKXnKB3aJ5vi1iAIP/pyfmm3o7boZ2cy3+Jg6iDhYCFf4V/n3V7dXZ1c3KBIMr/u6uZl5SQjImGhIJ/fnx6eHd1dHJxcG9ubWxra2loIP7V/9fn3c6+maiZjIWUh32BiXx2fIJ3dHl4dW91cHNuIM//4eyzw5nBrpyWpo+Slo6EaIeThn98iX59f4R5gXhxILv/7fPl287SqaiMsJSgiZeJkoCMQnFtjHh6Zmdlc3R+IPPy//7s6NjAycnAwKCdh5qoqK2ZkmVxjm5/kJyWgGx9IOTt/47vqM6ezNTJh8PVxD68dbmLsL2wg7W9o3ezPZpZIM7Q6v/lxNHP5N7S3szEtrWztbKgq6GQkkiWmaGclYxtIP/u+6rs0NSwzdGgqLuqwpqyooOPk5ykl4Vrf5uWf4ZgIP/lyNq6w9bRtZjAv7avtXS4jryorczGnLannJ+bU5+UIP/7ud/LyMOhjbiie56adIiLiIFubH2Cam5AZnB3YklfIPz16fn/8Nrj9tDH1/HIurTc3MTBysutt6nHsZ+nxp+xIMD/8N2/kod8aWlnaFlhWGJVUFRXUldDS1FKTUlJT0o9IP/l99/r4tuk5tfZ2cPH0ta+vb/B1r+028GXn6ClyLuwIP71+/b/q9ag6dTH2cXOwLqvtr3Dv7Co0sG8tZOawaakIJOKov+rhop1bXqc4Y1+iYNthI/GfkxsfWJpeLttO15WIPj/6Z7Sv5i3tJePjZmVj4GAiIuDZHV+f3tnbnV5bWJoIP3//u3Ut21pY36IkYd3f4NoXGl1hHRdcC1xbmlsaG9rIP///+/XuV+gpYmSjox7b3h6dXZxbnB4cHFlZnyFY4qHIOzj/+bMq4aKh4OBf3x5d3VzcnBubGxramlnZWdjY2JhIP/rzseNjo+bmJmbjbLNyo2/ecKBxsqse5KVg5F1aJ64IP/689mxnXLV4qLfzZpdjpeHxMGLt7yCnnKKfK2kcZ6pIP/OzcfS0tHRzcS5ubatoZGfmI19jId/c2R7dWxicGxoIPH/9vzj4NTNxbqzsrSqp5iin6GVjoyVj4x0fXuAd3BdIPf/zdvV4d3j3NnMwquOl6mjqJGGaoaUko2PeWSBh4+LIOL/5Nbs8e/k2tfUzLmlta6YtLm4qYqVlJCmqKidXY+ZIP/r2OXZ6efK5dLAyMa3wLPDtEKbpLrEpaCYpIC2vpilIP/94e//3t/S5bTh3tDU3NLKz83Ew76xsK+hnKGbl52aIOj/3eP/2+Di4tve3NPZzcXEwLCtq6Croqapm5GXl4eLIP/27LnRs8TItK6LkJmfdn50f2d6WnFqdFRLXmNQXVw+IP/c1dO9eceRpKd4d591e25fbH1nZHJhY2VfX2VdXFZbIP+xyaWngatamm9/d3Zrb2NkYGNgXGVaYVxcWVhUWU1VIP/39ubn9/DT2ubb0crPv6i8vLCfoKSrmpeLjY6fhlJ1IP/G4fbs6+7l2rXX0crU0J+yuoKunae3n5GnooibmY2RIP/h49K/rcC9tKalramenZuinpmXm5uZkY+VkY+LiY6PIP/h1c+xiq+2qZqaopyXkY2TlI6JjZCMhoWIhoOBgIGCIMD/26+KgXdygWBnZWdcVDtVPUA6JjFOLEs4MUUwNC0xIPz/reHEv5amtaaUg3uTkod7gYt+emV9bnFSX1pkXjw+IP/jvqqjopmdk5GNi4WHgIOAf35/fH14d3d0dHJwcnFvIP/W7tjh0suxxqDAs6GXoKiFkJuUlZicn5mgqI6amKlvIP/d1cjDxLnAv7u1urazr6y2sKiir6qmo6GooZuZo6CfIP/s39LFvLixqJ6YnZqQgH6LiH9scXh5c2BYaGxoSENXIP/d3+fh1szGuaaIlJB/dnJ8dXBzcGpycGttaWhnZGZoIP/Uzu+y273XpK3Yv8i6jb62xr2bqLHCt6ernbG1mpWdIP/lzrapkpeXm5CLg4qIhn18fX56dHJ3dnZycHFxcW1rIP/b8/Xu59Xd1tLHtLmtrbW0sbm0bp6be4GOopuLm5JtIP/m1NLHxsbDwsDAu7u8vr25vL6+u77AwL6+wMC+vL6+IP/79e3l3NbQx72zsaicjolXfIuSjYyLjY6PioN/iIV+IPG9/9rVwq6nwLrJkb2vvaWqqaypoqegp6OioaSemZ2gIPfp//jc5On04+n07Ofq3dLBs7jD0s3P0MXIxcbCusG4IP/e8t+y1NDY2NbRzcrFu7SvtbG1tLm4t7Gzr6ykn5iSIPre/P/n3OPl28nb3+Dn4djf3NPNwcK/sbm5urm1urq8IOXg//H8stTO183d39rYzsa/vKy0jaaOo4eSeZV7i3SGIOX/7LbBnritc6NqlJ5ng3mQiGWDZn+EaW9CfXJOYFZtIOD/+fW67fDt5dnLu6ydk4dYYWhpW2NbYV1fU1tTWVRYIP/B6brmtee44Xfpm9WrxqfGmcKLu6W+nrGBrJKpkox4IP/hvoKMjIKCgHt5eXZzdG1tamloZ2RmYmNiYGBfWl5bIP//5cGNgHhwd21mbGZiX15gX1dZVFVWVlFXS0dQSk1NIP+n4aXfmsCVvH+ihp9yj3uPbIFzg2p0bYNlZmZ9YVVjIPit/5/spZOU3W7Ni7tyu16ibqpRl2OdMYREj12AT4NGIP/P2bHVq7igqZelf6+Xfn6Qf6SOgmiOh4dzb3qCY4p0IPv/7dXEsKqyqqqIj5aia5GQi3+RflmRhnlth22Fi2hcIP+8tKumop6bk4qHg31+gX+Eg4F+fHZ1cm9vcG9xdHdyIP+4u5aQjYmIg399enl2dXJwb21samlpZ2ZlY2NhYWFgIP+44ZHPkciFuXekdqh2kEuYepRciHaZaZFtmG6TXJNoIP/L5+O1usrKm7i2t420qnyWrp6NnKeOlZyee5eWlHqWIP/TwJ+zi6uQfIN3gIZ7aXZ9dGtwdW5sbGlpaGdjY2VjIP/23s/OrKmlmJySl5qakoqMjI6Kf4OCg4F6f4F8d3d3IMbU9//z1efb9eXd0tzZ0dyVob+8ury+zMK3oa2tpZ2mIP/0+dfupeWm6aLKTr+LunTFdrZ9iXC0hK1wpGV6YaNnIP/p69zGnsPAuq+nq6qmo6CdnJycmJaWlZWRj5CRj42LIP/4/fHv9+Lc5dm82s/NyNG5tMKmrsi5orKflriyrKOuIP+0opiRjYmOxZXdloiAfHhzbbVxq353dHJwbm+DW2dqIP+7s6uoo5qblouGgoF/g32Fg4F9fHN5dW5tcW9zdHRzIP/L8+zn4tfWzsa8uraqp6CkppiRkIGHhHeEeXhxaGlhIP/0vPLw29O2w6KdraaZjoCUhoF5co+RfWWMhnNddn+AIP/GsavOqtSik5aVkq2Be4KAfnt7en15c290dG9xcG5sIP/M17TMr8eoz7CLiKibnXuwrpR1U4eOgpiNaop7ak1zIP7U/9P3xtXFxcOhuJippZufhqJ+j454mGV1fniKZm94IP/o3tfOu7jExLmzrbGtqqqfmp6fo5qWop+Zj4+Wko6SIP/e0ft5o52kjnODlIZ+enl+e3dydnh0b29yb21ra2prIP/xybXWu6G5t6icr72vr6W0pKeiiJ2moKBprIqTmZpyIPe18MHftfWt/sHrk/+Y+Kz3n/aM5ZTtgcBc33eteMp2IPjW36z/18TH9cOxm+HblafT36ygqcuqsK7HnKGiqZWTIP/o58zYla6DonHEi71txIS9Za5qs157CoBnm2WSbadrIP/K3IjOmrqQwHC4mLWBq4+kW6JFpoege5mOk3OLgZR5IP/s/fLev5ucl5CMiYeEg4F/fnt6eXh3dnR0cnFwb29uIP/ard6oyqK9oqKosKarnJubm5aSnaGho5ydmpKSn6KmIP/k+OPv6O2u0dLPqNzDys3HyMbI0Z+8ybaUus2th8eMIObk8P/99OLy8sDVzrbdy6/VwqrDn6HIqMiquKahlYaeIP/j7fH03v7/6sW83tDT5da6rNHUps/Uu5u/08yUw7mRINnz//TP5c7b5M/Jx7jLvMesvpqg0L1utqa+ubutnJaQIP+vnZSOhaiBr3qPdodvZ21bamhnZ2WWYYhfXV1cXFpbIOrw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OTguLTMzLSYtLCozIP/x2di4fo6ZjpqPfKfEwlyvM7Jmw8GnYoydiIh+cYSlIP3/8Mykq3jB3HPZ0kmaQ48ut7FMtrFGoT+MNJeaXI+gIP/gy9vZ083AvrCtop6VkIh7e3BwZWJaSU8/SDo9LSoiIOv//Pjd1822vKqroZmTkH2KdHd5XnRmQGxaaWBhX0daIP/7wuHj5uDbzsGlgbKssqeQfoaXmoF6aYGCaXdYbIB2IP/i+fLo15+bu7yhp5iemqmRjGeihZh6k3CRdIZrkHmDIP/05efv5e/hz8W/vLeex8GzyrC0qrK2u8O/po6zwa+xIPH77vH/1efk1dHl29rIy8nIwpC0sq2jkrKhoIileXZ5INz+8e//vO7j4dTY0tTGu7m5t6iir6qZg6iQln6jiodvIP/66qHRubaplZqCj3mGYnxEdDZtKmUyXyRcKlcrUjtVIP/YzdLAZrxklp2ER3NIa3IzRl9GQ003OT43OTczNDIvIP+Ww5GsfaJnkHFxY2JUWVdaUlVMVFFLSkZHP0hEQUVDIP/t9Obg9uuz1tXNrsC9qZipp555pKGRfZiQhGaMkYFaIP/u0fT26tTW0obLu5vAt4SkhJ+rn3+Yjoqaj2WQeISLIP/lvMaorqR8noCVhYuHgYZ6gXh9end3dHVwdHJwcm9tIP/mvMWkrZaNi3t8dm1yUnBKaFRgWU9UME8+SUlBTEJFIND/y4+GenZyampqaGFkYF9dXFtXXVdWVE5QT1dQTkxNIP/54MTArKKgpIihP5B6hX9kgHh1eGFzaGxyV25UYGpZIP/VmH9ya2xkZmJfWlpYWVhUUktPTU9MTEdDSURMREhAIPn/7vfp7+TX4NXb19bY0tbM08nNyMbJwsjFx8bDxbfCIP/x6+vj8uXX3dTa09fS1tDEz8PNwsvBs7+xvrC8r6euIP/w39PIv7apqZydkpGIhoFvdGloYV9RUElCRSVALDEpIP/48O3g0cGonHt5KmJOW0RKUUdSTkpITURGQzg/LzE7IP/e5PzB79DOtrPi09PAoK7K1LGrybbIvaLBubzGf6uqIP/mr62aipB7gXthdGZra2NoX2JiW19cXl5YWlhYWVhVIP/s9e/k1su+xsXKyr69qaiTpaOmnpKOiZGBl4KBd25xIPn/+//6+vPy7uzo597g1Nzc3eDh5OPn4eji6OPn49fiIP/56d7Nv6uZh5WRlJGNioB1c2BiUUxGRD5EMDgmFR0XIP/u4dvW08nGu8K3yLa4r7ejpJ+eiZqJj458iI16fnV/IP/y5dzB3+PNxsatv8K9w8G0ua2foo6VlYiJinVqgYODIP/YzdnV2NfNy8C2trK7truytaumm46Ea3xldFNyeHmGIP/vz93d3dvG2NfOzMy/urmjtK6xuLO2srSusqimo5CVIObm+P/67fXk4svIx5e2r6eJq3iXbphifWN9O4BseWp1IOf/7r65q8GgjKiKk6CHfX53i3Z6dIZRaX5pW3FtbmdlINn8/9zr8u/e1cCymo5rbkdPVlBKSkpMQjxDRE1MTUBTIP+luJXmjt6I1orZk8KcuZOuhZ6BgXB0dIBpf2ZwZ1xQIP/PlWxBOjQzIhIbGxQVABkLAAAMAAoAAAAIEgQAABAAIP/yyqBiVFdOPE4/RTlGO0Y6MCcpLSk2KywfNCMvLC83IP+h3IDbXrIVtEyZOJk9hkGDPnY4dzhsMmwyYzFiKlwkIP+X/qfymNpE1HLJeapqrGSbbZtoil6PWYVQiVJ7Y1dpIP+ezZTee8R8XmytaLpsbl+HaaM1cnx/XJQ1X3t9UX1HIPL/0s22vLCqsZmojaB/m36McpNphF2YcImGhWZ/jGp3IP+YeXpwYVE+UTlQSBE9F0krPz0ZADUqPTMrFx41JzYMIP+Nu3JsYFdTTUlHRUA/QDc7MjY0LTAxLysqKigqJy8lIP+L3IvGebRZqVSnaqZvpGugZp1hmWOVYZNhlFmVSYs9IP/c3uC2dsGznrC2qpurrJyVoZKKmJqTlZuMk5KWgYWNIP+7oIGfaodNbFBlQ1hEPT0+MEI0PTE9NDcsMiYjKhglIP/20rucq553opB/jGuCcmJ+TGdeW25UZmlaaV1kXlRiIKTI1f/r6ebo4tzMs6/Ev9O5vLWgkpaihZeMdXxif4GdIP/588/imd2R337II7NdwmmwaKU/dlekUaRFkjNqOYhLIP/pxsywsqialZiGkIWHh4GEfH99e3x5eXd1d3R0cnJyIPb1/8Hi6M3EzcefwrWfq5eZqKKbqqKJpalxnaaelaOMIP+LaVJWYWx8wWvehXRpYFdPO6c6qmVaVlRNTUt2N3JMIP+emIqGZWhPdGtlVU5MWmNWPiRSSVVUSytDSEhEQEgPIP/z9vLl39TExLG1sKeemYyIkYB6eXByb29iXlhgZ01DIP3/19/ZyZqbsKRqmJ17lXxxhFdob2o+ZWhIZ1FSXD1EIP+hio7MeMlyV1J0OZpUTCRUNFI5NUZCPEgWNiRCMzQoIP/L1KDRvsl9yrSRfJqQmXakqXCTdHCAWIyMVXxDd21RIO7W/9nv39y5n7eztJZtkqGoc2STjp5peZKIl1N/koOJIP/uu8K6nLKnh5OalHtok4hwjIaAjZGTiX2QiDuDfUeDIP/tq/efpnx+XG83ZDdURjtBLTdCKkcRPx9AITsmKyYdIP/o34PCusiwiZ/FtpihvKiVe6egqJiWna+Xipmoj3GEIP+U2J76oPqG5G3yQcVh2mSZWL1LfzOiOVcmfgA1DkstIOze3qP/1sWt78a7r8HZrJ7F0KyXm7ujb7GjqpiXm42kIP/y4crbpJp1oWzMU8N5zV2zbatQq16HR5AnigCWTpY/IP/BzKPFc8iRtoWvdLuSsJl6g5NrooWIgod9moOChWBpIP3/9+jHqohhWVVRTk9IRERIPkJFOjlAOjw6PTo2MTQ2IPP+3P/a8Nvd2dXUz9PN0dDKzcrPxc/Guca6xbnGuK+7IP/r7vPu6/PQ79a/0dXBxNvRy8/Yt6LCl7uYxbODb6+/IO3/9e7z59nl6bDNx7fPt6C3rLG2kaOre7uVdJmccop5INny9s//8srT3NLds8bbZ82krNLAsn+bxMiDiLKuxJ6LINL1//DW5tPO4tDSybLJwcmlwaKp1rCjsK27tLqwsZmZIP+Zin52caVtoGWEXohZWFdfUU5OSkmEToNKSUpFRkRDIMDGyv/p1sTWqaTJy9XZzNjIyLm7kKicnpySnYaclpKoIP/r08y+z8SasamYqK+cnpOCiJybkXx0co2YmIN5em+UIOvy/+nj8uvh4c6/xsXLvszExLKvioNkXZZ8eHeJm4qVINLY0q+37v/YyMCxrqunosKinaCZlZeVk5KSio6Mi4ybIGbtd8Vov378dZ53+HvcZ7Vx5mZrcvdq5maafP98mVnkILb/nN/aWNvcjMlOYbzRhtNVXICvW8JMNGfDVatXTj2cIMpB2UH/TMse3lKMKtNFoT1sP3w8vBWPNJo5XTynPHocIP/j19HKxcG9uba0sq+trKqop6Sjo6Gfnp2dm5uampmXIP+UiHV6b2dXWWRTTFxDS00/R01XS0MbRFI8ME1PPDk8IP/Xxry8u7i1sa6pp6Oin6Ccm5mZlpeWlpCSkpCPkJCNIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIMXFucusk9PijcC5+Mq8z+C/vtvbt8uz/8TKzerAmt/jIP+luoCRf4iZlniPeoaUgoN4nH5XgpaGhaxldIaKb5SSIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIF1hXV5eYmNlbWpvdHyZlv+WgnZuaGJnVVNRTUdJTERDIJvg/8Cyt4HEvJirqqXkcbWsZJvCmV6QkY2OhXWZl7mYIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIOr14+Hd69738u/m59La5eHT2O+8v8ni7vzU/93A297fIPb/5d3W+e3S5eLl6u3K5ffr7t/r4ergz/fW6Nnk3OXvIP/56L6uar3BrJePWo+VfHV7UXBvXWdwSmpiWlxWPkxZIP/e0rKxtb6rjaGAUn1/UYJDZEBSQ2krPjpJPFk9Rx9FIPn6/8ew1Kxrv6y3gKCjo2mXl4pwe4Nwa11+TF1CcHFJIP/627m5hJV1knWHUXJGcl5xVlJOYk1UKVZSRipMQVNGIP/uypVSY2BWVlVQVE1IR0dDQnRCdUI7Pjg/PDc5PTlBIP/s1KiGcGFeX1jEZMM/RlhEVEZIPkWHNZRDPR0+TTdFIP/n0pvu5Nui3+nHkM/fxZbN3ryRrMS8nbO1kYGkpaaIIP/m78fU2d3i1ti+x87AqLnEsI2crZ2NlKCJc3mCdXR0IP+Le3FqY6BfWlhVU1FTTEdLRUdGUkNDQ0BAPys/PT07IP+Ke3NvemxyeV9ZVEuiSrZWUU1LSUY9SUREQ0JFPj4/IP+Le3FqnI9fWlhUUlGLSUZIRkVEaEZDQT9APT47PDs7IP+Cb9l7cmxmY2BdXVxg0UJJSElHSEVIRENDQUJBPz8+IP+GgdpvamZeW2KqZFJNdEhsVphKR0JDQ0JIPEA9QzxCIP+GdmpkXFRYVVBOTUZFRURBQT89OTs7OTg5ODU1NC81IP+0vLev7ljrY2R3ebpN0ltOVVZOPHgpMTQrOzI3MUE6IP/w8O3zvcnIvdzW3WTEvs/csseWp7yxv6dToK61oKqtIP/DcOyEv4bXgIxwkHl2bqloamZvZmZjf2JZXlFaYVd4IKT/cGNXUU9PSUhEQUE+PDk3NzU2NTIzMjAtLC4vLS4qIP/xv7aSfWFwanNmZ19dV1VVUFJST1BRTUZOTUpVT0ZKIOr/4+SLxHm7ml1pnWNfcZhaWF+EWVhZb11RV1NZTVRvIOn/yufEvauvnqCWkH+Ee45RYEx9Rk1DcldbTVRPUFNTIO3+/83R282wkE2Wpp2QYjJyi4WDUVpYcn59L1dWZ3RyIPXx/47qd9N3yc/HeLfNvGWrYK5ZnbSsNJy1mlOSG5lMIP/09PPS1MzVzMbGx6Olq4ulo3+cnJWUiW1yb3pwd4OJIP/+9rDu09i3sKykmZ+Wg5unipR3k4WJhHx+V3BbY25dIP/hu7zOzt7Vr6mwnbiop7eXj5R2kKyng5+mU3yCX1iDIP/0iMS0vLF2aJ2DXn2GXBxrc1FVVWJaTFhLU0RPUERNIPz5/6735sXPpL+l0MayyrWpt6uLt7V7u7KQrax2qq5rIP/xyqSBaWdlXF5YWVRSUlFQTEhOTU1GS0BEQ0Q+SD8+IODt/8zZsci5zKSzkZ6sq7S1kYCWi4t5nZZ2hZyRg3VdIOvv/9jNxLi1vaekrYVdpaF+f3eaoJOPg4ySf4t8mpyhIGmVl/+Yg4KLeIaL2pyGfIl8hJHHloF6jH9/hbadiWp8IP/z2pq5m5mElXN+ZnxicCVkVF8ySExhTlU0TkZQNRA7IPH/7Majh3t+b3NwZlpGWVdkYFNKYjxVPU06WT8+RlJPINP/zY9uQl1vaFZwaERHIikCNRVAQDEyKEtBI0FONGZfIPX//s6jhHFkYF5cWlRVVVFSUU1NSUtISUJFPjxIRzY8IP/wxtW1eZ+jjZiLgZKwsUujSZhnrLKVcoOTeXBjgWeLIP//7celjljG0mnMyl2mXZo3rZYnpao+kluJQ4mEXI2KIP/16+LZz8W6sKadkYqEe3RtZmliYlhXU1FSTkxMRVRGIN/x/+HNvbaen4mOb3RscWBiOEdJTxsxP0JAKjIxNz4cIP/M7eLm3drLwZGFlZiZhk9/inJzR15veG9LRV9iXUdQIOz/68OvwrOos5+emICOk4GPi2+AcGF3bWx0UVhdSldVIP/v5ejl5d3S3ubKsczJx6fByba3rravqZO6tay1pJmSIPb//PL34+Tm5LrJw8usqa2+ro6Kn6WHd42hZFt8jm9S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'

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

const envelope = [[0, 1.16, 0.157, 0.252], [0, 1.58, 0.109, 0.276], [0, 1.56, 0.117, 0.136], [0.0232, 1.49, 0.111, 0.276], [0, 0.766, 0.0805, 0.0666], [0, 1.35, 0.0868, 0.0434], [0, 1.65, 0.134, 0.136], [0, 1.6, 0.129, 0.0434], [0, 1.09, 0.0605, 0.252], [0, 0.813, 0.0542, 0.159], [0, 0.766, 0.0224, 0.5], [0, 1.7, 0.217, 0.252], [0, 0.441, 0.0544, 0.0201], [0, 0.58, 0.0511, 0.0201], [0, 0.882, 0.0786, 0.5], [0, 1.56, 0.0909, 0.415], [0, 0.975, 0.721, 0.0666], [0, 0.0697, 0.94, 0.0898], [0, 0.139, 0.602, 0.0434], [0.0232, 0.0929, 0.802, 0.299], [0.0464, 0.627, 0.747, 0.136], [0.0464, 0.65, 0.492, 0.0898], [0.0464, 0.488, 0.715, 0.0201], [0.0232, 0.0929, 0.92, 0.159], [0, 1.6, 0.123, 0.0898], [0, 1.18, 0.052, 0.0434], [0, 1.07, 0.00299, 0.0201], [0, 1.07, 0.054, 0.0201], [0, 0.65, 0.051, 0.0201], [0, 0.163, 0.789, 0.136], [0, 0.139, 0.758, 0.136], [0, 2, 0.233, 0.0201], [0, 1.7, 0.15, 0.252], [0, 1.42, 0.0763, 0.0201], [0, 1.6, 0.124, 0.0434], [0, 1.56, 0.132, 0.0898], [0, 1.32, 0.0756, 0.136], [0, 0.766, 0.128, 0.0201], [0.0232, 0.418, 0.0556, 0.0201], [0.0464, 1.72, 0.0445, 0.0434], [0.0464, 2, 0.315, 0.276], [0.0464, 0.255, 0.77, 0.159], [0.116, 0.488, 0.859, 0.113], [0.0464, 0.163, 0.855, 0.252], [0.0929, 0.673, 0.651, 0.5], [0, 0.372, 0.0391, 0.0201], [0, 0.789, 0.0757, 0.5], [0, 1.58, 0.12, 0.5], [0.0464, 0.627, 0.682, 0.5], [0.163, 0.488, 0.944, 0.5], [0.0697, 0.0929, 0.962, 0.5], [0.0929, 0.743, 0.979, 0.5], [0.186, 2, 0.892, 0.276], [0.0464, 0.0929, 0.868, 0.113], [0.0697, 0.279, 0.255, 0.368], [0.0232, 0.395, 0.035, 0.0201], [0.139, 0.186, 0.962, 0.136], [0.0464, 0.72, 0.444, 0.0434], [0, 1.14, 0.334, 0.136], [0, 0.0929, 0.687, 0.0666], [0.0232, 0.627, 0.828, 0.485], [0.0232, 2, 0.861, 0.136], [0.0929, 0.186, 0.838, 0.136], [0.0464, 0.186, 0.556, 0.113], [0.0232, 0.0464, 0.965, 0.0898], [0.0232, 0.186, 0.661, 0.0898], [0.0232, 2, 0.871, 0.0201], [0, 2, 0.67, 0.0201], [0.0232, 0.0464, 0.992, 0.136], [0.0232, 0.0929, 1, 0.0434], [0, 2, 0.658, 0.0201], [0.0464, 0.116, 0.759, 0.0434], [0.0232, 0.116, 0.576, 0.0201], [0.0464, 0.139, 0.726, 0.0201], [0.0232, 0.255, 0.519, 0.136], [0, 0.0464, 0.712, 0.0898], [0.0929, 0.163, 0.378, 0.113], [0.0232, 0.325, 0.174, 0.0201], [0.116, 0.163, 0.987, 0.159], [0.0232, 0.302, 0.516, 0.0201], [0.0232, 2, 0.814, 0.0201], [0, 0.139, 0.683, 0.0201], [0.0464, 2, 0.284, 0.159], [0, 0.139, 0.769, 0.0201], [0, 0.627, 0.503, 0.0201], [0, 1.16, 0.646, 0.229], [0.0232, 1.72, 0.445, 0.5], [0, 0.0464, 0.905, 0.0434], [0, 0.627, 0.632, 0.5], [0.441, 2, 0.217, 0.461], [0.0464, 0.975, 0.704, 0.252], [0, 0.511, 0.66, 0.5], [0.0929, 2.02, 0.0269, 0.5], [0.186, 1.6, 0.103, 0.5], [0.116, 0.998, 0.626, 0.5], [0.418, 0.65, 0.681, 0.5], [0.0232, 1.6, 0.199, 0.136], [0.418, 0.441, 0.703, 0.5], [0.0232, 0.998, 0.0314, 0.461], [0.0929, 1.72, 0.123, 0.5], [0, 1.44, 0.241, 0.5], [0.534, 2, 0.584, 0.5], [0.0232, 2, 0.885, 0.5], [0.0929, 1.51, 0.327, 0.5], [0.0232, 1.86, 0.238, 0.5], [0, 1.14, 0.0565, 0.252], [0, 0.604, 0.0565, 0.5], [0, 0.464, 0.062, 0.5], [0, 0.488, 0.0529, 0.0201], [0, 0.0232, 0.998, 0.0434], [0.0464, 0.882, 0.532, 0.252], [0, 0.279, 0.678, 0.0898], [0, 1.42, 0.0644, 0.5], [0, 0.116, 0.00112, 0.0201], [0, 0.488, 0.051, 0.0201], [3, 2, 0, 0.0201], [0, 0.975, 0.0521, 0.368], [0, 0.279, 0.0387, 0.0201], [0, 0.836, 0.0509, 0.0201], [0.627, 1.88, 4.54e-08, 0.0201], [0.0697, 0.163, 0.0072, 0.0201], [0.116, 0.255, 0.328, 0.299], [1.44, 2, 0.976, 0.5], [0.0232, 0.139, 0.0105, 0.5], [0, 0.209, 0.917, 0.5], [0.906, 2, 0.654, 0.5], [0.279, 2, 0.999, 0.5], [0, 0.302, 0.0269, 0.0201]];
const volumes = [1.4, 1, 1.05, 1.05, 1.1];
const instBalance = [-5.4, -5.2, -4.6, -3.9, -4.3, -5.2, -8.5, -8.2, -3.8, -5.1, -5.5, -4.2, -2.9, -7.2, -4.1, -7.7, -3.6, -3.7, -3.3, -3.9, -3.4, -4.9, -4.1, -6.0, -5.1, -6.8, -3.3, -4.9, -4.0, -4.7, -5.1, -4.5, -3.7, -4.9, -3.9, -5.6, -4.6, -5.1, -6.0, -5.7, -7.4, -4.1, -8.3, -6.7, -6.1, -4.1, -5.9, -4.4, -5.7, -5.3, -4.2, -3.4, -3.7, -4.9, -3.4, -10.0, -7.3, -4.9, -5.4, -8.5, -4.0, -5.7, -9.1, -3.7, -5.2, -8.2, -7.1, -7.6, -7.0, -4.1, -6.8, -5.3, -3.7, -4.0, -3.9, -4.5, -4.7, -5.0, -4.0, -3.8, -6.4, -6.8, -3.3, -3.5, -6.7, -4.7, -3.8, -4.6, -3.3, -7.2, -5.2, -3.4, -4.0, -5.7, -6.0, -3.3, -3.8, -5.5, -2.1, -6.2, -4.2, -7.2, -5.0, -7.9, -7.7, -5.6, -6.8, -7.4, -5.7, -8.0, -5.5, -7.1, -6.1, -8.6, -4.8, -2.4, -8.1, -7.6, -8.5, -6, -9.7, -4.3, -6, -0.5, -4.7, -6, -11.0, -11.0]


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