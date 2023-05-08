import { useEffect, useState } from "react";
import { View } from "react-native";

import { NavigationContainer } from "@react-navigation/native";

import { Provider as PaperProvider } from "react-native-paper";

import { signInWithCustomToken } from "firebase/auth";
import {
  equalTo,
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
} from "firebase/database";
import { httpsCallable } from "firebase/functions";

import { useAuthState } from "react-firebase-hooks/auth";

import { Context } from "./Context";
import { auth, database, firebaseToken, functions } from "./Firebase";
import { styles } from "./Styles";
import RabbitSim, { Activity } from "./components/RabbitSim";
import Table from "./components/Table";
import { getMinuteTime, getSeason } from "./helper_functions/dateAndTime";
import scale from "./helper_functions/scale";
import { Tabs } from "./navigators/TabNavigator";
import DebugScreen from "./screens/Debug";
import P5Screen from "./screens/P5Screen";

export const GetValKey = (snapshot) =>
  snapshot.val().type == "str" ? "string" : "integer";

export default function App() {
  const [user, authLoading, authError] = useAuthState(auth);
  const linking = {
    prefixes: [],
  };

  const [simEnvData, setSimEnvData] = useState({
    // user/physical inputs
    temp: { updateFromDisplay: true, value: 19 },
    humidity: { updateFromDisplay: true, value: 50 },
    time: { updateFromDisplay: true, value: getMinuteTime(new Date()) },
    season: {
      updateFromDisplay: true,
      value: getSeason(new Date().getMonth()),
    },
    visitor: { updateFromDisplay: true, value: false },
    randomChoice: { updateFromDisplay: true, value: 50 }, // maps to saturation; 0-100
  });

  function setSimEnvDataWrapper(newData) {
    var debounceTimer;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // console.log(`setSimEnvDataWrapper: `);
      // console.log(newData);
      setSimEnvData(newData);
    }, 1000);
  }

  function updateSimValue(key, newValue) {
    if (
      simEnvData[key].updateFromDisplay &&
      newValue != simEnvData[key].value
    ) {
      setSimEnvDataWrapper({
        ...simEnvData,
        [key]: { ...simEnvData[key], value: newValue },
      });
      console.log(`updateSimValue[${key}].value=${newValue} (${typeof newValue})`);
    }
  }

  useEffect(() => {
    console.log(`new simEnvData: `)
    console.log(simEnvData)
  }, [simEnvData])

  // On light hue change, update the temperature
  onValue(
    query(
      ref(database, "data"),
      orderByChild("groupId"),
      equalTo(21),
      limitToLast(1)
    ),
    (snapshot) => {
      let newHue = Object.values(snapshot?.val())[0].integer ?? 0; // 0-360
      let scaleHueToTemp = scale([0, 360], [0, 20]);
      let scaledTemp = Math.round(
        scaleHueToTemp(Math.max(0, Math.min(360, newHue)))
      );
      updateSimValue("temp", scaledTemp);
    }
  );

  // On light saturation change, update the random choice
  onValue(
    query(
      ref(database, "data"),
      orderByChild("groupId"),
      equalTo(22),
      limitToLast(1)
    ),
    (snapshot) => {
      let newRandomChoice = Math.round(
        Object.values(snapshot?.val())[0].integer ?? 0
      ); // 0-100
      updateSimValue("randomChoice", newRandomChoice);
    }
  );

  // On light brightness change, update the time of day
  onValue(
    query(
      ref(database, "data"),
      orderByChild("groupId"),
      equalTo(22),
      limitToLast(1)
    ),
    (snapshot) => {
      let newBrightness = Math.round(
        Object.values(snapshot?.val())[0].integer ?? 0
      ); // 0-100 -> 0-1440
      let scaleBrightToTime = scale([0, 100], [0, 720]);
      let scaledTime = Math.round(
        scaleBrightToTime(Math.max(0, Math.min(100, newBrightness)))
      );
      if (newBrightness % 2 == 1) scaledTime = 1440 - scaledTime; // odd values are noon to midnight
      updateSimValue("time", scaledTime);
    }
  );

  // On motion detector 1 change, update visitor presence
  onValue(
    query(
      ref(database, "data"),
      orderByChild("groupId"),
      equalTo(3),
      limitToLast(1)
    ),
    (snapshot) => {
      let newVisitor = (Object.values(snapshot?.val())[0].integer ?? 0) == 1;
      updateSimValue("visitor", newVisitor);
    }
  );

  // On change to outside humidity, update simulation state
  onValue(
    query(
      ref(database, "data"),
      orderByChild("groupId"),
      equalTo(11),
      limitToLast(1)
    ),
    (snapshot) => {
      let newHumidity = Object.values(snapshot?.val())[0].integer ?? 0;
      updateSimValue("humidity", newHumidity);
    }
  );

  const [raining, setRaining] = useState(false);
  const [rabbitInside, setRabbitInside] = useState(false);
  const [rabbitActivity, setRabbitActivity] = useState(Activity.play);

  // On grey rabbit contact, move the rabbit outside
  onValue(
    query(
      ref(database, "data"),
      orderByChild("groupId"),
      equalTo(8),
      limitToLast(1)
    ),
    (snapshot) => {
      let withGreyRabbit =
        (Object.values(snapshot?.val())[0].integer ?? 0) == 1;
      if (withGreyRabbit && rabbitInside) {
        setRabbitInside(false);
      }
    }
  );

  // On white rabbit contact, move the rabbit inside
  onValue(
    query(
      ref(database, "data"),
      orderByChild("groupId"),
      equalTo(8),
      limitToLast(1)
    ),
    (snapshot) => {
      let withWhiteRabbit =
        (Object.values(snapshot?.val())[0].integer ?? 0) == 1;
      if (withWhiteRabbit && !rabbitInside) {
        setRabbitInside(true);
      }
    }
  );

  /* Authenticate with token upon load */
  useEffect(() => {
    (async () => {
      const getToken = httpsCallable(functions, "getToken");
      const token = await getToken({ token: firebaseToken });
      if (token?.data?.result === "ok" && token?.data?.token) {
        signInWithCustomToken(auth, token.data.token);
      } else {
        console.error(token?.data?.reason ?? "unknownError");
      }
    })();
  }, []);

  // add p5 library to DOM upon load
  useEffect(() => {
    const script = document.createElement("script");

    script.src = "https://cdn.jsdelivr.net/npm/p5@1.2.0/lib/p5.js";
    script.async = true;

    document.body.appendChild(script);
    console.log("Added p5");

    return () => {
      document.body.removeChild(script);
      console.log("Removed p5");
    };
  }, []);

  function Contents() {
    switch (window.location.pathname.replace("%20", " ").substring(1)) {
      case Tabs.p5:
        return <P5Screen />;
      case Tabs.expo:
        return <Table />;
      case Tabs.debug:
      default:
        return <DebugScreen />;
    }
  }

  return (
    <NavigationContainer linking={linking} fallback={<Text>Loading...</Text>}>
      <PaperProvider>
        <Context.Provider
          value={{
            simEnvData: simEnvData,
            setSimEnvData: setSimEnvData,
            raining: raining,
            setRaining: setRaining,
            rabbitInside: rabbitInside,
            setRabbitInside: setRabbitInside,
            rabbitActivity: rabbitActivity,
            setRabbitActivity: setRabbitActivity,
          }}
        >
          <RabbitSim style={{ width: "100%" }} />
          <View style={styles.container}>
            <Contents />
          </View>
        </Context.Provider>
      </PaperProvider>
    </NavigationContainer>
  );
}
