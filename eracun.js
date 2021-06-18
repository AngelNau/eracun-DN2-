if (!process.env.PORT) process.env.PORT = 8080;

// Priprava povezave na podatkovno bazo
const sqlite3 = require("sqlite3").verbose();
const pb = new sqlite3.Database("MovieInvoice.sl3");

// Priprava dodatnih knjižnic
const formidable = require("formidable");

// Priprava strežnika
const express = require("express");
const streznik = express();
streznik.set("view engine", "hbs");
streznik.use(express.static("public"));

// Podpora sejam na strežniku
const expressSession = require("express-session");
streznik.use(
  expressSession({
    secret: "123456789QWERTY", // Skrivni ključ za podpisovanje piškotov
    saveUninitialized: true, // Novo sejo shranimo
    resave: false, // Ne zahtevamo ponovnega shranjevanja
    cookie: {
      maxAge: 3600000, // Seja poteče po 1 h neaktivnosti
    },
  })
);

const razmerje_USD_EUR = 0.84;

// Vrne naziv stranke (ime in priimek) glede na ID stranke
const vrniNazivStranke = (strankaId, povratniKlic) => {
  pb.all(
    "SELECT Customer.FirstName || ' ' || Customer.LastName AS naziv \
         FROM   Customer \
         WHERE  Customer.CustomerId = $id",
    { $id: strankaId },
    (napaka, vrstica) => {
      if (napaka) povratniKlic("");
      else povratniKlic(vrstica.length > 0 ? vrstica[0].naziv : "");
    }
  );
};

// Vrni seznam filmov
const vrniSeznamFilmov = (povratniKlic) => {
  pb.all(
    "SELECT   Movie.MovieId AS id, \
              Movie.OriginalTitle AS naslov, \
              Movie.VoteAverage AS ocena, \
              COUNT(InvoiceLine.InvoiceId) AS steviloProdaj, \
              GROUP_CONCAT(DISTINCT Language.NameShort) AS jeziki, \
              Movie.ReleaseDate AS datumIzdaje, \
              Movie.Runtime AS trajanje, \
              Movie.Revenue AS dobicek, \
              Movie.Budget AS stroski, \
              GROUP_CONCAT(DISTINCT Genre.Name) AS zanri \
     FROM     Movie, Language, MovieSpokenLanguages, Genre, MovieGenres, InvoiceLine \
     WHERE    Language.LanguageId = MovieSpokenLanguages.LanguageId AND \
              Movie.MovieId = MovieSpokenLanguages.MovieId AND \
              Genre.GenreId = MovieGenres.GenreId AND \
              Movie.MovieId = MovieGenres.MovieId AND \
              Movie.MovieId = InvoiceLine.MovieId \
     GROUP BY Movie.MovieId \
     ORDER BY ocena DESC, steviloProdaj DESC, naslov ASC \
     LIMIT    100",
    (napaka, vrstice) => {
      for (let i = 0; i < vrstice.length; i++) {
        vrstice[i].marketing = "obicajno";
        if(vrstice[i].zanri.includes("Action")) {
          vrstice[i].marketing += " akcija";
        } else if(vrstice[i].zanri.includes("Comedy")) {
          vrstice[i].marketing += " komedija";
        } else if(vrstice[i].zanri.includes("Action") && vrstice[i].zanri.includes("Comedy")) {
          vrstice[i].marketing += " AinK";
        }
      }
      povratniKlic(napaka, vrstice);
    }
  );
};

// Vrni podrobnosti filma v košarici iz podatkovne baze
const filmiIzKosarice = (zahteva, povratniKlic) => {
  // Če je košarica prazna
  if (!zahteva.session.kosarica || zahteva.session.kosarica.length == 0) {
    povratniKlic([]);
  } else {
    pb.all(
      "SELECT   DISTINCT Movie.MovieId AS stevilkaArtikla, \
                1 AS kolicina, \
                Movie.OriginalTitle AS opisArtikla, \
                Movie.OriginalTitle AS naslov, \
                Language.NameShort AS jezik, \
                Movie.Runtime AS trajanje, \
                Movie.VoteAverage AS ocena, \
                GROUP_CONCAT(DISTINCT Genre.Name) AS zanri \
       FROM     Movie, Genre, MovieGenres, Language \
       WHERE    Genre.GenreId = MovieGenres.GenreId AND \
                Movie.LanguageId = Language.LanguageId AND \
                Movie.MovieId = MovieGenres.MovieId AND \
                Movie.MovieId IN (" +
        zahteva.session.kosarica.join(",") +
        ") \
       GROUP BY Movie.MovieId",
      (napaka, vrstice) => {
        if (napaka) povratniKlic(false);
        else povratniKlic(vrstice);
      }
    );
  }
};

// Vrni podrobnosti filmov na računu
const filmiIzRacuna = function (racunId, povratniKlic) {
  pb.all(
    "SELECT DISTINCT Movie.MovieId AS stevilkaArtikla, \
            Movie.OriginalTitle || ' (' || STRFTIME('%Y',Movie.ReleaseDate) || ')' AS opisArtikla, \
            Movie.Runtime AS trajanje, \
            1 AS kolicina, \
            0 AS popust, \
            Language.NameShort AS jezik \
     FROM   Movie, Language, Invoice \
     WHERE  Movie.LanguageId = Language.LanguageId AND \
            Movie.MovieId IN ( \
              SELECT  InvoiceLine.MovieId \
              FROM    InvoiceLine, Invoice \
              WHERE   InvoiceLine.InvoiceId = Invoice.InvoiceId AND \
                      Invoice.InvoiceId = $id \
            )",
    { $id: racunId },
    (napaka, vrstice) => {
      if (napaka) povratniKlic(false);
      else povratniKlic(napaka, vrstice);
    }
  );
};

// Vrni podrobnosti o stranki iz računa
const strankaIzRacuna = (racunId, povratniKlic) => {
  pb.all(
    "SELECT Customer.* \
     FROM   Customer, Invoice \
     WHERE  Customer.CustomerId = Invoice.CustomerId AND \
            Invoice.InvoiceId = $id",
    { $id: racunId },
    (napaka, vrstice) => {
      if (napaka) povratniKlic(false);
      else povratniKlic(vrstice[0]);
    }
  );
};

// Vrni podrobnosti o stranki iz seje
const strankaIzSeje = (zahteva, povratniKlic) => {
  strankaIzBaze(zahteva.session.trenutnaStranka, (stranka)=> {
    povratniKlic(stranka);
  })
};

// Vrni podrobnosti o strani iz podatkovne baze
const strankaIzBaze = (strankaId, povratniKlic) => {
  pb.get(
    "SELECT Customer.* \
     FROM   Customer \
     WHERE  Customer.CustomerId = $cid",
    { $cid: strankaId },
    (napaka, vrstica) => povratniKlic(vrstica)
  );
};

// Vrni stranke iz podatkovne baze
const vrniStranke = (povratniKlic) => {
  pb.all("SELECT * FROM Customer", (napaka, stranke) => {
    vrniRacune((napaka1, racun1) => {
      stranke.forEach(stranka => {
        stranka.steviloRacunov = prestejRacuneZaStranko(stranka, racun1);
      })
    })
    povratniKlic(napaka, stranke);
  });
};

// Vrni račune iz podatkovne baze
const vrniRacune = (povratniKlic) => {
  pb.all(
    "SELECT Customer.FirstName || ' ' || Customer.LastName || \
            ' (' || Invoice.InvoiceId || ') - ' || \
            DATE(Invoice.InvoiceDate) AS Naziv, \
            Customer.CustomerId AS IdStranke, \
            Invoice.InvoiceId \
     FROM   Customer, Invoice \
     WHERE  Customer.CustomerId = Invoice.CustomerId",
    (napaka, vrstice) => povratniKlic(napaka, vrstice)
  );
};

// Vrni število strank po državah
const strankeGledeNaDrzave = (povratniKlic) => {
  pb.all(
    "SELECT    COUNT(Customer.Country) as stUporabnikov, \
               Customer.Country as drzava \
     FROM      Customer \
     WHERE     Customer.Country is not null \
     GROUP BY  Customer.Country \
     ORDER BY  Customer.Country ASC",
    (napaka, vrstica) => povratniKlic(napaka, vrstica)
  );
};

// Preštej račune za podano stranko. 
// Vhodni podatki: [stranka, seznam računov], 
// Rezultat: celoštevilska vsota računov.
const prestejRacuneZaStranko = (stranka, racuni) => {
  let stevec = 0;
  for (let i = 0; i < racuni.length; i++) {
    if (
      racuni[i].Naziv.startsWith(stranka.FirstName + " " + stranka.LastName)
    ) {
      racuni[i].Jeziki = "Vsi jeziki filmov na računu";
      stevec++;
    }
  }
  return stevec;
};

// Prikaz seznama filmov na strani
streznik.get("/vec-o-filmu/:idFilma", (zahteva, odgovor) => {
  let idFilma = parseInt(zahteva.params.idFilma, 10);
  pb.get(
    "SELECT   Movie.MovieId AS id, \
              Movie.OriginalTitle AS naslov, \
              Movie.VoteAverage AS ocena, \
              Movie.ImdbId AS imdb, \
              Movie.PosterPath AS poster, \
              Movie.Tagline AS povzetek, \
              COUNT(InvoiceLine.InvoiceId) AS steviloProdaj, \
              GROUP_CONCAT(DISTINCT Language.NameShort) AS jeziki, \
              DATE(Movie.ReleaseDate) AS datumIzdaje, \
              Movie.Runtime AS trajanje, \
              Movie.Revenue AS dobicek, \
              Movie.Budget AS stroski, \
              GROUP_CONCAT(DISTINCT Genre.Name) AS zanri \
     FROM     Movie, Language, MovieSpokenLanguages, Genre, MovieGenres, InvoiceLine \
     WHERE    Language.LanguageId = MovieSpokenLanguages.LanguageId AND \
              Movie.MovieId = MovieSpokenLanguages.MovieId AND \
              Genre.GenreId = MovieGenres.GenreId AND \
              Movie.MovieId = MovieGenres.MovieId AND \
              Movie.MovieId = InvoiceLine.MovieId AND \
              Movie.MovieId = $id",
    { $id: idFilma },
    (napaka, vrstice) => {
      odgovor.send(vrstice);
    }
  );
});

// Prikaz začetne strani
streznik.get("/", (zahteva, odgovor) => {
  vrniSeznamFilmov((napaka, vrstice) => {
    if (napaka) {
      odgovor.sendStatus(500);
    } else {
      let zanri = new Set();
      for (let i = 0; i < vrstice.length; i++) {
        vrstice[i].cena = (
          vrstice[i].cena *
          (1 + vrstice[i].stopnja / 100)
        ).toFixed(2);
        zanri.add(vrstice[i].zanr);
      }
      vrniNazivStranke(zahteva.session.trenutnaStranka, (nazivOdgovor) => {
        odgovor.render("seznam", {
          podnaslov: "Nakupovalni seznam",
          prijavniGumb: zahteva.session.trenutnaStranka
            ? "Odjava"
            : "Odjava gosta",
          seznamFilmov: vrstice,
          nazivStranke: nazivOdgovor,
        });
      });
    }
  });
});

// Dodajanje oz. brisanje filmov iz košarice
streznik.get("/kosarica/:idFilma", (zahteva, odgovor) => {
  let idFilma = parseInt(zahteva.params.idFilma, 10);

  if (!zahteva.session.kosarica) zahteva.session.kosarica = [];

  if (zahteva.session.kosarica.indexOf(idFilma) > -1) {
    // Če je pesem v košarici, jo izbrišemo
    zahteva.session.kosarica.splice(
      zahteva.session.kosarica.indexOf(idFilma),
      1
    );
  } else {
    // Če filma ni v košarici, jo dodamo
    zahteva.session.kosarica.push(idFilma);
  }
  // V odgovoru vrnemo vsebino celotne košarice
  odgovor.send(zahteva.session.kosarica);
});

// Vrni podrobnosti košarice
streznik.get("/kosarica", (zahteva, odgovor) => {
  filmiIzKosarice(zahteva, (filmi) => {
    if (!filmi) odgovor.sendStatus(500);
    else odgovor.send(filmi);
  });
});

// Izpis račun v HTML predstavitvi na podlagi podatkov iz baze
streznik.post("/izpisiRacunBaza", (zahteva, odgovor) => {
  let form = new formidable.IncomingForm();
  form.parse(zahteva, (napaka, polja) => {
    let racunId = parseInt(polja["seznamRacunov"], 10);
    strankaIzRacuna(racunId, (stranka) => {
      filmiIzRacuna(racunId, (napaka, filmi) => {
        let povzetek = {
          vsotaSPopustiInDavki: 0,
          vsoteZneskovDdv: { 0: 0, 9.5: 0, 22: 0 },
          vsoteOsnovZaDdv: { 0: 0, 9.5: 0, 22: 0 },
          vsotaVrednosti: 0,
          vsotaPopustov: 0,
        };

        filmi.forEach((film, i) => {
          film.zapSt = i + 1;
          film.cena = film.trajanje / 100;
          film.vrednost = film.kolicina * film.cena;
          film.davcnaStopnja = 22;

          film.popustStopnja = 0;
          film.popust = film.kolicina * film.cena * (film.popustStopnja / 100);

          film.osnovaZaDdv = film.vrednost - film.popust;
          film.ddv = film.osnovaZaDdv * (film.davcnaStopnja / 100);
          film.osnovaZaDdvInDdv = film.osnovaZaDdv + film.ddv;

          povzetek.vsotaSPopustiInDavki += film.osnovaZaDdv + film.ddv;
          povzetek.vsoteZneskovDdv["" + film.davcnaStopnja] += film.ddv;
          povzetek.vsoteOsnovZaDdv["" + film.davcnaStopnja] += film.osnovaZaDdv;
          povzetek.vsotaVrednosti += film.vrednost;
          povzetek.vsotaPopustov += film.popust;
        });
        odgovor.setHeader("Content-Type", "text/xml");
        odgovor.render("eslog", {
          vizualiziraj: true,
          postavkeRacuna: filmi,
          povzetekRacuna: povzetek,
          stranka: stranka,
          layout: null,
        });
      });
    });
  });
});

// Izpis računa v HTML predstavitvi ali izvorni XML obliki
streznik.get("/izpisiRacun/:oblika", (zahteva, odgovor) => {
  strankaIzSeje(zahteva, (stranka) => {
    filmiIzKosarice(zahteva, (filmi) => {
      if (!filmi) {
        odgovor.sendStatus(500);
      } else if (filmi.length == 0) {
        odgovor.send(
          "<p>V košarici nimate nobenega filma, zato računa ni mogoče pripraviti!</p>"
        );
      } else {
        let povzetek = {
          vsotaSPopustiInDavki: 0,
          vsoteZneskovDdv: { 0: 0, 9.5: 0, 22: 0 },
          vsoteOsnovZaDdv: { 0: 0, 9.5: 0, 22: 0 },
          vsotaVrednosti: 0,
          vsotaPopustov: 0,
        };

        filmi.forEach((film, i) => {
          film.zapSt = i + 1;
          film.cena = film.trajanje / 100;
          film.vrednost = film.kolicina * film.cena;
          film.davcnaStopnja = 22;

          film.popustStopnja = ((film.zanri.split(",").length >= 2) ? 5 : 0) + film.ocena;
          film.popust = film.kolicina * film.cena * (film.popustStopnja / 100);

          film.osnovaZaDdv = film.vrednost - film.popust;
          film.ddv = film.osnovaZaDdv * (film.davcnaStopnja / 100);
          film.osnovaZaDdvInDdv = film.osnovaZaDdv + film.ddv;

          povzetek.vsotaSPopustiInDavki += film.osnovaZaDdv + film.ddv;
          povzetek.vsoteZneskovDdv["" + film.davcnaStopnja] += film.ddv;
          povzetek.vsoteOsnovZaDdv["" + film.davcnaStopnja] += film.osnovaZaDdv;
          povzetek.vsotaVrednosti += film.vrednost;
          povzetek.vsotaPopustov += film.popust;
        });

        odgovor.setHeader("Content-Type", "text/xml");
        odgovor.render("eslog", {
          vizualiziraj: zahteva.params.oblika == "html",
          postavkeRacuna: filmi,
          povzetekRacuna: povzetek,
          stranka: stranka,
          layout: null,
        });
      }
    });
  });
});

// Privzeto izpiši račun v HTML obliki
streznik.get("/izpisiRacun", (zahteva, odgovor) => {
  odgovor.redirect("/izpisiRacun/html");
});

// Vrni število registriranih strank glede na državo
streznik.get("/stranke_po_drzavah", (zahteva, odgovor) => {
  strankeGledeNaDrzave((napaka, vrstica) => {
    if (napaka) odgovor.send(napaka);
    else odgovor.send(vrstica);
  });
});

// Registracija novega uporabnika
streznik.post("/prijava", (zahteva, odgovor) => {
  let form = new formidable.IncomingForm();
  let sporociloNapaka = "Prišlo je do napake pri dodajanju nove stranke. Prosim, preverite vnesene podatke in poskusite znova.";
  var napaka4;
  form.parse(zahteva, (napaka, polja) => {
    if(polja.FirstName.length > 0 && polja.LastName.length > 0 && polja.Company.length > 0 && polja.Address.length > 0 &&
      polja.City.length > 0 && polja.State.length > 0 && polja.Country.length > 0 && polja.PostalCode.length > 0 && polja.Phone.length > 0
      && polja.Phone.charAt(0) == '+' && polja.Fax.length > 0 && polja.Email.length > 0) {
      napaka4 = false;
    } else {
      napaka4 = true;
    }
    if(!napaka4) {
      pb.run(
        "INSERT INTO Customer (FirstName, LastName, Company, \
                              Address, City, State, Country, PostalCode, \
                              Phone, Fax, Email, SupportRepId) \
        VALUES ($fn, $ln, $com, $addr, $city, $state, $country, $pc, $phone, \
                $fax, $email, $sri)",
        { 
          $sri: 8, 
          $fn: polja.FirstName,
          $ln: polja.LastName,
          $com: polja.Company,
          $addr: polja.Address,
          $city: polja.City,
          $state: polja.State,
          $country: polja.Country,
          $pc: polja.PostalCode,
          $phone: polja.Phone,
          $fax: polja.Fax,
          $email: polja.Email
        },
        
        (napaka) => {
          vrniStranke((napaka1, stranke) => {
            vrniRacune((napaka2, racuni) => {
              strankeGledeNaDrzave((napaka3, strankePoDrzavah) => {
                var st = 0;
                for(var i = 0; i < strankePoDrzavah.length; i++) {
                  if(strankePoDrzavah[i].drzava.toLowerCase() == polja.Country.toLowerCase()) {
                    st = strankePoDrzavah[i].stUporabnikov;
                    break;
                  } else {
                    st = 0;
                  }
                }
                let sporociloOK = "Nova stranka " + polja.FirstName + " " + polja.LastName + " kot " + st + ". v državi " + polja.Country + " je bila uspešno dodana.";
                odgovor.render("prijava", {
                  prijavniGumb: "Prijava stranke",
                  sporocilo:
                    napaka || napaka1 || napaka2 || napaka3 || napaka4
                      ? sporociloNapaka
                      : sporociloOK,
                  seznamStrank: stranke,
                  seznamRacunov: racuni,
                });
              });
            });
          });
        }
      );
    } else {
        vrniStranke((napaka1, stranke) => {
          vrniRacune((napaka2, racuni) => {
            strankeGledeNaDrzave((napaka3, strankePoDrzavah) => {
              odgovor.render("prijava", {
                prijavniGumb: "Prijava stranke",
                sporocilo:
                  napaka || napaka1 || napaka2 || napaka3 || napaka4
                    ? sporociloNapaka
                    : sporociloOK,
                seznamStrank: stranke,
                seznamRacunov: racuni,
              });
            });
          });
        });
      }
  });
});

// Prikaz strani za prijavo
streznik.get("/prijava", (zahteva, odgovor) => {
  vrniStranke((napaka1, stranke) => {
    vrniRacune((napaka2, racuni) => {
      for (let i = 0; i < stranke.length; i++) stranke[i].stRacunov = 0;

      for (let i = 0; i < racuni.length; i++)
        filmiIzRacuna(racuni[i].InvoiceId, (napaka, vrstice) => {});

      odgovor.render("prijava", {
        sporocilo: "",
        prijavniGumb: "Prijava stranke",
        podnaslov: "Prijavna stran",
        seznamStrank: stranke,
        seznamRacunov: racuni,
      });
    });
  });
});

// Prikaz nakupovalne košarice za stranko
streznik.post("/stranka", (zahteva, odgovor) => {
  let form = new formidable.IncomingForm();
  form.parse(zahteva, (napaka1, polja, datoteke) => {
    zahteva.session.trenutnaStranka = parseInt(polja["seznamStrank"], 10);
    odgovor.redirect("/");
  });
});

// Prijava ali odjava stranke
streznik.get("/prijavaOdjava/:strankaId", (zahteva, odgovor) => {
  if (zahteva.get("referer").endsWith("/prijava")) {
    // Izbira stranke oz. prijava
    zahteva.session.trenutnaStranka = parseInt(zahteva.params.strankaId, 10);
    odgovor.redirect("/");
  } else {
    // Odjava stranke
    delete zahteva.session.trenutnaStranka;
    delete zahteva.session.kosarica;
    odgovor.redirect("/prijava");
  }
});

// Prikaz seznama filmov na strani
streznik.get("/podroben-seznam-filmov", (zahteva, odgovor) => {
  vrniSeznamFilmov((napaka, vrstice) => {
    var tabelica = [];
    if (napaka) odgovor.sendStatus(500);
    else{
      for(var i = 0; i < vrstice.length; i++) {
        if((vrstice[i].dobicek != 0) || (vrstice[i].stroski != 0)) {
          tabelica.push(vrstice[i]);
        }
      }
    }
    odgovor.send(tabelica);
  });
});

streznik.get("/jeziki-racuna/:racunId", (zahteva, odgovor) => {
  let racunId = parseInt(zahteva.params.racunId, 10);
  filmiIzRacuna(racunId, (napaka, vrstice) => {
    if(napaka) {
      odgovor.sendStatus(500);
    } else {
      var msg = "Jezik";
      var Crka = "";
      for(var i = 0; i < vrstice.length; i++) {
        if(!Crka.includes(vrstice[i].jezik)) {
          Crka += (vrstice[i].jezik);
        }
      }
      if(Crka.length == 4) {
        msg += "a";
      } else if(Crka.length >= 5) {
        msg += "i";
      }
      msg += " na računu: ";
      for(var i = 0; i < Crka.length; i++) {
        if(i == 0) {
          msg += Crka[i];
          continue;
        }
        if(i % 2 == 0)
          msg += ", ";
        msg += Crka[i];
      }
      msg += ".";
      odgovor.send(msg);
    }
  });
});

streznik.listen(process.env.PORT, () => {
  console.log(`Strežnik je pognan na vratih ${process.env.PORT}!`);
});
