package kh.school.sms.people;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface StudentRepository extends JpaRepository<Student, Long> {
    /** Students with the same normalised Khmer name and date of birth: the "possible duplicate" warning. */
    List<Student> findByNameKmAndDateOfBirth(String nameKm, LocalDate dateOfBirth);
}
