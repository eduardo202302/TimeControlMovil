import FormForgotPassword from "@/components/login/FormForgotPassword";
import ResetPassword from "@/components/login/Reset-password";
import VerifyPin from "@/components/login/Verify-pin";
import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResponsive } from "@/constants/responsive";
import { useSchoolStore } from "../../store/useSchoolStore";

const ForgotPassword = () => {
  const { scale } = useResponsive();
  const styles = useMemo(() => createStyles(scale), [scale]);

  const { school } = useSchoolStore();
  const { name, logo } = school || {};

  // step: 1 = formulario, 2 = PIN, 3 = reset password
  const [step, setStep] = useState(1);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.authContainer}>
        {step === 1 && (
          <FormForgotPassword
            name={name}
            image={logo}
            onNext={() => setStep(2)} // cuando termine el primer formulario
          />
        )}

        {step === 2 && (
          <VerifyPin
            name={name}
            image={logo}
            onNext={() => setStep(3)} // cuando se verifique el PIN
          />
        )}

        {step === 3 && <ResetPassword name={name} image={logo} />}
      </View>
    </SafeAreaView>
  );
};

function createStyles(scale: (size: number) => number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#dfe9ff",
      justifyContent: "center",
      alignItems: "center",
    },
    authContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: scale(24),
    },
  });
}

export default ForgotPassword;
